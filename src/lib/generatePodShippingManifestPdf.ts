import { jsPDF } from "jspdf";

export interface PodBatchShippingRow {
  order_number: string;
  postcard_count: number;
  shipping_method: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_street: string | null;
  recipient_postal_code: string | null;
  recipient_city: string | null;
  pickup_point_code: string | null;
  pickup_point_name: string | null;
  pickup_point_address: string | null;
  pickup_point_city: string | null;
  carrier_label_status: string;
  tracking_number: string | null;
}

export interface PodManifestPdfResult {
  fileName: string;
  downloadUrl: string;
}

const shippingMethodLabel = (method: string) => ({
  inpost: "InPost",
  orlen: "ORLEN Paczka",
  courier: "Kurier",
}[method] ?? method);

export const generatePodShippingManifestPdf = (
  batchNumber: string,
  productionDate: string,
  rows: PodBatchShippingRow[],
): PodManifestPdfResult => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `POD ${batchNumber} - manifest wysyłek`,
    subject: "Lista kompletacyjna POD dla drukarni",
    creator: "Podróżówka",
  });
  let y = 18;
  const margin = 14;
  const pageHeight = 297;
  const pageWidth = 210;
  const addPageIfNeeded = (needed: number) => {
    if (y + needed <= pageHeight - 14) return;
    doc.addPage("a4", "portrait");
    y = 18;
  };

  doc.setFillColor(205, 31, 38);
  doc.rect(0, 0, pageWidth, 8, "F");
  doc.setTextColor(45, 34, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PODRÓŻÓWKA - MANIFEST WYSYŁEK", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(105, 90, 80);
  doc.text(`Paczka produkcyjna: ${batchNumber} | data: ${productionDate} | zamówień: ${rows.length}`, margin, y);
  y += 10;
  doc.setDrawColor(220, 210, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  doc.setFontSize(8.5);
  doc.setTextColor(125, 92, 58);
  doc.text("Dokument kompletacyjny dla drukarni. Nie zastępuje etykiet nadawczych przewoźnika.", margin, y);
  y += 7;

  rows.forEach((row, index) => {
    const isPickup = row.shipping_method === "inpost" || row.shipping_method === "orlen";
    const addressLines = isPickup
      ? [row.pickup_point_code, row.pickup_point_name, row.pickup_point_address, row.pickup_point_city].filter(Boolean) as string[]
      : [row.recipient_name, row.recipient_street, [row.recipient_postal_code, row.recipient_city].filter(Boolean).join(" "), row.recipient_email].filter(Boolean) as string[];
    const addressHeight = Math.max(14, addressLines.length * 4.5 + 9);
    const blockHeight = Math.max(39, addressHeight + 18);
    addPageIfNeeded(blockHeight + 5);

    doc.setFillColor(250, 247, 242);
    doc.setDrawColor(220, 210, 200);
    doc.roundedRect(margin, y, pageWidth - margin * 2, blockHeight, 3, 3, "FD");
    doc.setFillColor(205, 31, 38);
    doc.roundedRect(margin + 4, y + 4, 34, 8, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`POZYCJA ${String(index + 1).padStart(2, "0")}`, margin + 8, y + 9.5);
    doc.setTextColor(45, 34, 30);
    doc.setFontSize(12);
    doc.text(row.order_number, margin + 44, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${row.postcard_count} Podróżówek | ${shippingMethodLabel(row.shipping_method)}`, margin + 44, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(isPickup ? "PUNKT ODBIORU" : "ODBIORCA", margin + 7, y + 23);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    addressLines.forEach((line, lineIndex) => doc.text(line, margin + 7, y + 29 + lineIndex * 4.7));
    doc.setFontSize(8.5);
    doc.setTextColor(125, 92, 58);
    const carrierText = row.tracking_number
      ? `Numer przewozowy: ${row.tracking_number}`
      : "Etykieta przewoźnika: do utworzenia przez integrację";
    doc.text(carrierText, margin + 7, y + blockHeight - 6);
    doc.setTextColor(45, 34, 30);
    y += blockHeight + 5;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(125, 92, 58);
  doc.text("Podróżówka | dokument wewnętrzny POD", margin, pageHeight - 8);
  const fileName = `${batchNumber}-MANIFEST-WYSYLEK.pdf`;
  const downloadUrl = URL.createObjectURL(doc.output("blob"));
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return { fileName, downloadUrl };
};
