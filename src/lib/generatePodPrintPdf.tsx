import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { PostcardFront, type CropSettings } from "@/components/postcard/PostcardFront";
import { PostcardBack } from "@/components/postcard/PostcardBack";

const SHEET_WIDTH_MM = 320;
const SHEET_HEIGHT_MM = 450;
const BLEED_MM = 3;
const TRIM_WIDTH_MM = 148;
const TRIM_HEIGHT_MM = 105;
const SLOT_WIDTH_MM = TRIM_WIDTH_MM + BLEED_MM * 2;
const SLOT_HEIGHT_MM = TRIM_HEIGHT_MM + BLEED_MM * 2;
const COLUMNS = 2;
const ROWS = 4;
const ITEMS_PER_SHEET = COLUMNS * ROWS;
const SHEET_LEFT_MM = (SHEET_WIDTH_MM - SLOT_WIDTH_MM * COLUMNS) / 2;
const SHEET_TOP_MM = (SHEET_HEIGHT_MM - SLOT_HEIGHT_MM * ROWS) / 2;
const RENDER_WIDTH_PX = 520;
const RENDER_HEIGHT_PX = 375;
// 520 CSS pixels * 3.5 / 154 mm = 300 dpi on the imposed bleed area.
const RENDER_SCALE = 3.5;
const PUBLIC_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL?.trim() || window.location.origin;
const normalizeLanguageCode = (value?: string | null) => value?.trim().toLowerCase() || "";
export const podLanguageTemplateKey = (countryId: string, languageCode?: string | null) =>
  `${countryId}:${normalizeLanguageCode(languageCode)}`;

interface CardDesignData {
  id: string;
  country_id: string;
  country_iso2?: string | null;
  country_flag_url?: string | null;
  image_front_url: string | null;
  photo_author: string | null;
  thank_you_text: string | null;
  back_qr_label: string | null;
  crop_settings: unknown;
}

interface PodUnitRow {
  id: string;
  card_design_id: string;
  order_item_id: string | null;
  primary_language_code?: string | null;
  secondary_language_code?: string | null;
}

interface LanguageTemplateData {
  country_id: string;
  language_code: string;
  front_thank_you_text: string;
  back_qr_label: string;
}

interface PodJobItemRow {
  id: string;
  print_job_id: string;
  inventory_unit_id: string;
  public_claim_code: string;
  qr_url: string;
  generated_at: string;
}

interface PodPrintJobRow {
  id: string;
  total_items: number;
  generated_items: number;
  status: string;
}

interface RenderedPodItem {
  id: string;
  front: string;
  back: string;
}

export interface PodPrintPdfResult {
  fileName: string;
  downloadUrl: string;
  itemCount: number;
  sheetCount: number;
}

const parseCropSettings = (value: unknown): CropSettings => {
  if (!value) return { fit: "auto", zoom: 100, x: 50, y: 50 };
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as CropSettings;
    } catch {
      return { fit: "auto", zoom: 100, x: 50, y: 50 };
    }
  }
  return value as CropSettings;
};

const waitForImages = async (container: HTMLElement) => {
  const images = Array.from(container.querySelectorAll("img"));
  const loading = Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => reject(new Error(`Nie udało się wczytać obrazu: ${image.src}`)), { once: true });
      });
    }),
  );
  await Promise.race([
    loading,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Przekroczono czas wczytywania grafiki wzoru.")), 20_000);
    }),
  ]);
};

const renderCard = async (
  side: "front" | "back",
  design: CardDesignData,
  qrCodeDataUrl: string,
): Promise<string> => {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${RENDER_WIDTH_PX}px`,
    height: `${RENDER_HEIGHT_PX}px`,
    background: "#ffffff",
    zIndex: "-1",
  });
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(
    side === "front" ? (
      <PostcardFront
        imageUrl={design.image_front_url}
        photoAuthor={design.photo_author}
        contentText={design.thank_you_text}
        cropSettings={parseCropSettings(design.crop_settings)}
        showCropMarks={false}
        printMode
        className="w-full h-full"
      />
    ) : (
      <PostcardBack
        backQrLabel={design.back_qr_label}
        countryIso2={design.country_iso2}
        countryFlagUrl={design.country_flag_url}
        qrCodeUrl={qrCodeDataUrl}
        showCropMarks={false}
        printMode
        className="w-full h-full"
      />
    ),
  );

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await document.fonts?.ready;
    await waitForImages(host);
    const canvas = await html2canvas(host, {
      backgroundColor: "#ffffff",
      width: RENDER_WIDTH_PX,
      height: RENDER_HEIGHT_PX,
      scale: RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      logging: false,
    });
    return side === "front" ? canvas.toDataURL("image/jpeg", 0.96) : canvas.toDataURL("image/png");
  } finally {
    root.unmount();
    host.remove();
  }
};

const slotPosition = (slot: number) => ({
  x: SHEET_LEFT_MM + (slot % COLUMNS) * SLOT_WIDTH_MM,
  y: SHEET_TOP_MM + Math.floor(slot / COLUMNS) * SLOT_HEIGHT_MM,
});

// The sheet is turned on its short (horizontal) edge between front and back.
// Therefore a card stays in the same column and moves to the mirrored row.
// Reversing the complete slot index would mirror columns too, which pairs a
// postcard front with the QR code from the neighbouring postcard.
const backSlotForShortEdgeFlip = (frontSlot: number) => {
  const column = frontSlot % COLUMNS;
  const row = Math.floor(frontSlot / COLUMNS);
  return (ROWS - 1 - row) * COLUMNS + column;
};

const drawCropMarks = (doc: jsPDF, slot: number) => {
  const { x, y } = slotPosition(slot);
  const left = x + BLEED_MM;
  const right = left + TRIM_WIDTH_MM;
  const top = y + BLEED_MM;
  const bottom = top + TRIM_HEIGHT_MM;
  // The artwork includes a 3 mm bleed. Keep the crop marks a further 2.5 mm
  // outside that artwork, so no line visually enters the photo at a corner.
  // `gap` is measured from the trim line, hence it includes both values.
  const artworkClearance = 2.5;
  const gap = BLEED_MM + artworkClearance;

  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.12);

  doc.line(x, top, left - gap, top);
  doc.line(right + gap, top, x + SLOT_WIDTH_MM, top);
  doc.line(x, bottom, left - gap, bottom);
  doc.line(right + gap, bottom, x + SLOT_WIDTH_MM, bottom);
  doc.line(left, y, left, top - gap);
  doc.line(left, bottom + gap, left, y + SLOT_HEIGHT_MM);
  doc.line(right, y, right, top - gap);
  doc.line(right, bottom + gap, right, y + SLOT_HEIGHT_MM);
};

const addSideToSheet = (
  doc: jsPDF,
  items: RenderedPodItem[],
  side: "front" | "back",
) => {
  items.forEach((item, index) => {
    // With duplex "flip on short edge", the back sheet is imposed in the
    // vertically mirrored slot so every cut card receives its matching QR.
    const slot = side === "front" ? index : backSlotForShortEdgeFlip(index);
    const { x, y } = slotPosition(slot);
    const data = side === "front" ? item.front : item.back;
    const format = side === "front" ? "JPEG" : "PNG";
    doc.addImage(data, format, x, y, SLOT_WIDTH_MM, SLOT_HEIGHT_MM, `${side}-${item.id}`, "FAST");
    drawCropMarks(doc, slot);
  });
};

const generatePodPrintPdfForJobs = async (
  printJobIds: string[],
  documentNumber: string,
): Promise<PodPrintPdfResult> => {
  if (printJobIds.length === 0) throw new Error("No POD print jobs selected.");
  const jobsData = (await Promise.all(
    printJobIds.map(async (jobId) => {
      const snapshot = await getDoc(doc(db, "qr_print_jobs", jobId));
      return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as PodPrintJobRow) : null;
    }),
  )).filter((job): job is PodPrintJobRow => job !== null);
  if (jobsData.length !== printJobIds.length) {
    throw new Error("Nie znaleziono wszystkich zadań POD paczki.");
  }

  const jobItemsData: PodJobItemRow[] = [];
  // Firestore's `in` filter has a 30 value limit. A production batch may
  // contain more orders, so fetch each job separately and sort afterwards.
  for (const printJobId of printJobIds) {
    const snapshot = await getDocs(query(collection(db, "qr_print_job_items"), where("print_job_id", "==", printJobId)));
    jobItemsData.push(...snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PodJobItemRow)));
  }
  jobItemsData.sort((left, right) =>
    String(left.generated_at || "").localeCompare(String(right.generated_at || "")) || left.id.localeCompare(right.id),
  );

  if (!jobItemsData.length) throw new Error("Zadanie POD nie zawiera kartek do wydruku.");
  const itemCounts = new Map<string, number>();
  for (const item of jobItemsData) {
    itemCounts.set(item.print_job_id, (itemCounts.get(item.print_job_id) ?? 0) + 1);
  }
  for (const job of jobsData) {
    if (job.status !== "ready" && job.status !== "printed") {
      throw new Error("Kody QR dla jednego z zamówień nie są jeszcze gotowe.");
    }
    if (itemCounts.get(job.id) !== job.total_items || itemCounts.get(job.id) !== job.generated_items) {
      throw new Error("Liczba kodów QR nie zgadza się z liczbą kartek w zadaniu POD.");
    }
  }

  // Avoid a deeply nested PostgREST join here. With RLS enabled on all three
  // tables that query can exceed the database statement timeout even for a
  // small order. Primary-key lookups keep the POD download predictable.
  const jobItems = jobItemsData;
  const inventoryUnitIds = [...new Set(jobItems.map((item) => item.inventory_unit_id))];
  const units = (await Promise.all(inventoryUnitIds.map(async (unitId) => {
    const snapshot = await getDoc(doc(db, "inventory_units", unitId));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as PodUnitRow) : null;
  }))).filter((unit): unit is PodUnitRow => unit !== null);
  if (!units.length) throw new Error("Nie znaleziono sztuk POD przypisanych do kodów QR.");
  const designIds = [...new Set(units.map((unit) => unit.card_design_id))];
  const designsData = (await Promise.all(designIds.map(async (designId) => {
    const snapshot = await getDoc(doc(db, "card_designs", designId));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as CardDesignData) : null;
  }))).filter((design): design is CardDesignData => design !== null);
  if (!designsData.length) throw new Error("Nie znaleziono wzorów kartek dla zadania POD.");

  const countryIds = [...new Set(designsData.map((design) => design.country_id))];
  const countriesData = (await Promise.all(countryIds.map(async (countryId) => {
    const snapshot = await getDoc(doc(db, "countries", countryId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  }))).filter((country): country is { id: string; iso2?: string; flag_url?: string } => country !== null);
  const countryById = new Map(
    (countriesData ?? []).map((country) => [
      country.id,
      { iso2: country.iso2, flag_url: country.flag_url },
    ]),
  );
  const templatesData = (await Promise.all(countryIds.map(async (countryId) => {
    const snapshot = await getDocs(query(collection(db, "card_language_templates"), where("country_id", "==", countryId)));
    return snapshot.docs.map((item) => item.data() as LanguageTemplateData);
  }))).flat();
  const templateByCountryAndCode = new Map(templatesData.map((template) => [podLanguageTemplateKey(template.country_id, template.language_code), template]));

  const QRCode = await import("qrcode");
  const renderedFronts = new Map<string, string>();
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const designsById = new Map(
    designsData.map((design) => [
      design.id,
      {
        ...design,
        country_iso2: countryById.get(design.country_id)?.iso2 ?? null,
        country_flag_url: countryById.get(design.country_id)?.flag_url ?? null,
      },
    ]),
  );

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [SHEET_WIDTH_MM, SHEET_HEIGHT_MM],
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({
    title: `${documentNumber} - SRA3`,
    subject: "Arkusze impozycyjne SRA3, druk dwustronny, flip on short edge",
    creator: "Podróżówka",
  });

  // Render one SRA3 sheet at a time. A physical stock order may contain
  // thousands of cards; retaining every front/back canvas in memory would
  // exhaust the browser before the PDF could be written.
  const sheetCount = Math.ceil(jobItems.length / ITEMS_PER_SHEET);
  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    const sourceItems = jobItems.slice(sheetIndex * ITEMS_PER_SHEET, (sheetIndex + 1) * ITEMS_PER_SHEET);
    const sheetItems: RenderedPodItem[] = [];

    for (const item of sourceItems) {
      const unit = unitsById.get(item.inventory_unit_id);
      const design = unit ? designsById.get(unit.card_design_id) : undefined;
      if (!design) throw new Error(`Brak wzoru dla kodu ${item.public_claim_code}.`);
      const registrationUrl = new URL(item.qr_url, PUBLIC_APP_URL).toString();
      const qrCodeDataUrl = await QRCode.toDataURL(registrationUrl, {
        width: 600,
        margin: 3,
        errorCorrectionLevel: "M",
      });
      const primary = templateByCountryAndCode.get(podLanguageTemplateKey(design.country_id, unit?.primary_language_code));
      const secondary = unit?.secondary_language_code ? templateByCountryAndCode.get(podLanguageTemplateKey(design.country_id, unit.secondary_language_code)) : undefined;
      const combined = (base: string | null, primaryText?: string, secondaryText?: string) =>
        [primaryText || base || "", secondaryText || ""].filter((value, index, values) => value && values.indexOf(value) === index).join(" / ");
      const printDesign: CardDesignData = {
        ...design,
        thank_you_text: combined(design.thank_you_text, primary?.front_thank_you_text, secondary?.front_thank_you_text),
        back_qr_label: combined(design.back_qr_label, primary?.back_qr_label, secondary?.back_qr_label),
      };
      const frontCacheKey = `${design.id}:${unit?.primary_language_code || "base"}:${unit?.secondary_language_code || ""}`;
      let front = renderedFronts.get(frontCacheKey);
      if (!front) {
        front = await renderCard("front", printDesign, qrCodeDataUrl);
        renderedFronts.set(frontCacheKey, front);
      }
      sheetItems.push({
        id: item.id,
        front,
        back: await renderCard("back", printDesign, qrCodeDataUrl),
      });
    }

    if (sheetIndex > 0) pdf.addPage([SHEET_WIDTH_MM, SHEET_HEIGHT_MM], "portrait");
    addSideToSheet(pdf, sheetItems, "front");
    pdf.addPage([SHEET_WIDTH_MM, SHEET_HEIGHT_MM], "portrait");
    addSideToSheet(pdf, sheetItems, "back");
  }

  const documentFilePrefix = /^(POD|MAG)-/.test(documentNumber) ? documentNumber : `POD-${documentNumber}`;
  const fileName = `${documentFilePrefix}-SRA3.pdf`;
  const pdfBlob = pdf.output("blob");
  const downloadUrl = URL.createObjectURL(pdfBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  downloadLink.style.display = "none";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  return { fileName, downloadUrl, itemCount: jobItems.length, sheetCount };
};

export const generatePodPrintPdf = (printJobId: string, orderNumber: string) =>
  generatePodPrintPdfForJobs([printJobId], orderNumber);

export const generatePodBatchPrintPdf = (printJobIds: string[], batchNumber: string) =>
  generatePodPrintPdfForJobs(printJobIds, batchNumber);
