import {
  fromFirestoreFields,
  queryDocuments,
  readDocument,
} from "../../api/_lib/gcp-firestore.js";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "../../src/lib/podImposition.js";
import { getPodPrintFormat } from "../../src/lib/podPrintFormats.js";
import {
  buildPodPrintManifest,
  hashPodPrintRenderInput,
  resolvePodPrintSourceOrderId,
  type PodPrintManifestSourceItem,
  type PodPrintRenderInput,
} from "../../src/lib/podPrintManifest.js";

type FirestoreRecord = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalizeLanguage = (value: unknown) => text(value).toLowerCase() || null;
const lexicalCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

const readRecord = async (collection: string, id: string) => {
  const document = await readDocument(collection, id);
  if (!document.fields) throw new Error(`manifest_source_document_missing:${collection}/${id}`);
  return { id, ...fromFirestoreFields(document.fields) } as FirestoreRecord & { id: string };
};

export interface PodPrintManifestSourceReader {
  read(collection: string, id: string): Promise<FirestoreRecord & { id: string }>;
  query(collection: string, field: string, value: string, limit: number): Promise<Array<FirestoreRecord & { id: string }>>;
}

const defaultReader: PodPrintManifestSourceReader = {
  read: readRecord,
  query: async (collection, field, value, limit) => (
    await queryDocuments(collection, field, { stringValue: value }, limit)
  ).map((document) => ({ id: document.id, ...document.data } as FirestoreRecord & { id: string })),
};

const parseCropSettings = (value: unknown) => {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const orderItemIndex = (unit: FirestoreRecord) => {
  const match = text(unit.order_item_id).match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const inventorySerial = (unit: FirestoreRecord) => {
  const explicit = typeof unit.inventory_serial_no === "number" ? unit.inventory_serial_no : Number.NaN;
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;
  const match = text(unit.internal_inventory_code).match(/-(\d+)$/);
  if (match) return Number(match[1]);
  throw new Error(`manifest_inventory_serial_unavailable:${unit.id}`);
};

const combinedText = (base: unknown, primary: unknown, secondary: unknown) => (
  [text(primary) || text(base), text(secondary)]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" / ") || null
);

export const resolvePodPublicAppUrl = (environment: Record<string, string | undefined> = process.env) => {
  const value = environment.PUBLIC_APP_URL || environment.FRONTEND_ORIGIN;
  if (!value) throw new Error("manifest_public_app_url_unavailable: set PUBLIC_APP_URL or FRONTEND_ORIGIN");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("manifest_public_app_url_invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("manifest_public_app_url_invalid");
  return parsed.toString().replace(/\/$/, "");
};

export const resolvePodPublicAssetUrl = (
  value: unknown,
  environment: Record<string, string | undefined> = process.env,
) => {
  const source = text(value);
  if (!source) return null;
  let parsed: URL;
  try {
    parsed = new URL(source, `${resolvePodPublicAppUrl(environment)}/`);
  } catch {
    throw new Error("manifest_asset_url_invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("manifest_asset_url_invalid");
  return parsed.toString();
};

const sourceOrderIdForJob = (job: FirestoreRecord, units: FirestoreRecord[]) => {
  const unitOrderIds = [...new Set(units.map((unit) => text(unit.order_id)).filter(Boolean))];
  if (unitOrderIds.length > 1) throw new Error(`manifest_job_has_multiple_source_orders:${job.id}`);
  return resolvePodPrintSourceOrderId({
    inventory_unit_order_id: unitOrderIds[0] || null,
    print_job_order_id: text(job.order_id) || null,
    stock_production_order_id: text(job.stock_production_order_id) || null,
  });
};

export interface AuthoritativePodPrintManifestInput {
  printJobIds: string[];
}

export const buildAuthoritativePodPrintManifest = async (
  input: AuthoritativePodPrintManifestInput,
  reader: PodPrintManifestSourceReader = defaultReader,
) => {
  const uniqueJobIds = [...new Set(input.printJobIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueJobIds.length) throw new Error("print_job_ids_required");
  if (uniqueJobIds.length !== input.printJobIds.length) throw new Error("duplicate_print_job_id");

  const jobs = await Promise.all(uniqueJobIds.map((id) => reader.read("qr_print_jobs", id)));
  const jobContexts = await Promise.all(jobs.map(async (job) => {
    if (!["ready", "printed"].includes(text(job.status))) throw new Error(`manifest_print_job_not_ready:${job.id}`);
    const items = await reader.query("qr_print_job_items", "print_job_id", job.id, 10000);
    if (items.length !== Number(job.total_items) || items.length !== Number(job.generated_items)) {
      throw new Error(`manifest_print_job_item_count_mismatch:${job.id}`);
    }
    const units = await Promise.all(items.map((item) => reader.read("inventory_units", text(item.inventory_unit_id))));
    const sourceOrderId = sourceOrderIdForJob(job, units);
    return { job, items, units, sourceOrderId };
  }));
  jobContexts.sort((left, right) => lexicalCompare(left.sourceOrderId, right.sourceOrderId));
  for (let index = 1; index < jobContexts.length; index += 1) {
    if (jobContexts[index - 1].sourceOrderId === jobContexts[index].sourceOrderId) {
      throw new Error(`manifest_duplicate_source_order:${jobContexts[index].sourceOrderId}`);
    }
  }

  const designIds = [...new Set(jobContexts.flatMap((context) => context.units.map((unit) => text(unit.card_design_id))))];
  const designs = new Map((await Promise.all(designIds.map((id) => reader.read("card_designs", id)))).map((design) => [design.id, design]));
  const countryIds = [...new Set([...designs.values()].map((design) => text(design.country_id)))];
  const countries = new Map((await Promise.all(countryIds.map((id) => reader.read("countries", id)))).map((country) => [country.id, country]));
  const templates = (await Promise.all(countryIds.map(async (countryId) => (
    await reader.query("card_language_templates", "country_id", countryId, 500)
  )))).flat();
  const templateByKey = new Map(templates.map((template) => [
    `${text(template.country_id)}:${text(template.language_code).toLowerCase()}`,
    template,
  ]));

  const sources: PodPrintManifestSourceItem[] = [];
  const formats = new Map<string, ReturnType<typeof getPodPrintFormat>>();
  for (let batchOrderIndex = 0; batchOrderIndex < jobContexts.length; batchOrderIndex += 1) {
    const context = jobContexts[batchOrderIndex];
    const paired = context.items.map((item, index) => {
      const unit = context.units[index];
      return { item, unit, orderItemIndex: orderItemIndex(unit), serial: inventorySerial(unit) };
    }).sort((left, right) => left.orderItemIndex - right.orderItemIndex || left.serial - right.serial);
    for (let index = 1; index < paired.length; index += 1) {
      if (paired[index - 1].orderItemIndex === paired[index].orderItemIndex && paired[index - 1].serial === paired[index].serial) {
        throw new Error(`manifest_duplicate_job_position:${context.job.id}`);
      }
    }

    for (let sequenceIndex = 0; sequenceIndex < paired.length; sequenceIndex += 1) {
      const { item, unit } = paired[sequenceIndex];
      const design = designs.get(text(unit.card_design_id));
      if (!design) throw new Error(`manifest_design_missing:${unit.card_design_id}`);
      const country = countries.get(text(design.country_id));
      if (!country) throw new Error(`manifest_country_missing:${design.country_id}`);
      const primaryCode = normalizeLanguage(unit.primary_language_code);
      const secondaryCode = normalizeLanguage(unit.secondary_language_code);
      const primary = primaryCode ? templateByKey.get(`${design.country_id}:${primaryCode}`) : undefined;
      const secondary = secondaryCode ? templateByKey.get(`${design.country_id}:${secondaryCode}`) : undefined;
      const explicitFormatId = text(unit.print_format_id);
      const printFormatId = explicitFormatId || CURRENT_POSTCARD_PRINT_FORMAT.print_format_id;
      const storedFormatSource = text(unit.print_format_source);
      if (storedFormatSource && storedFormatSource !== "inventory_unit" && storedFormatSource !== "legacy_fallback_v1") {
        throw new Error(`manifest_print_format_source_invalid:${unit.id}`);
      }
      const formatSource = !explicitFormatId || storedFormatSource === "legacy_fallback_v1"
        ? "legacy_fallback_v1" as const
        : "inventory_unit" as const;
      const format = getPodPrintFormat(printFormatId);
      const existingFormat = formats.get(printFormatId);
      if (existingFormat && JSON.stringify(existingFormat) !== JSON.stringify(format)) {
        throw new Error(`manifest_print_format_configuration_conflict:${printFormatId}`);
      }
      formats.set(printFormatId, format);
      const renderInput: PodPrintRenderInput = {
        qr_url: new URL(text(item.qr_url), resolvePodPublicAppUrl()).toString(),
        front_text: combinedText(design.thank_you_text, primary?.front_thank_you_text, secondary?.front_thank_you_text),
        back_qr_label: combinedText(design.back_qr_label, primary?.back_qr_label, secondary?.back_qr_label),
        image_front_url: resolvePodPublicAssetUrl(design.image_front_url),
        image_version: text(design.image_version) || text(design.image_generation) || text(design.updated_at) || null,
        photo_author: text(design.photo_author) || null,
        crop_settings: parseCropSettings(design.crop_settings),
        country_iso2: text(country.iso2) || null,
        country_flag_url: resolvePodPublicAssetUrl(country.flag_url),
      };
      sources.push({
        id: item.id,
        print_format_id: printFormatId,
        format_source: formatSource,
        batch_order_index: batchOrderIndex,
        sequence_index: sequenceIndex,
        pod_job_id: context.job.id,
        inventory_unit_id: unit.id,
        card_design_id: design.id,
        source_order_id: context.sourceOrderId,
        primary_language_code: primaryCode,
        secondary_language_code: secondaryCode,
        render_input: renderInput,
        render_input_sha256: await hashPodPrintRenderInput(renderInput),
      });
    }
  }
  return buildPodPrintManifest(sources, Array.from(formats.values()));
};
