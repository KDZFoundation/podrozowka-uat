// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "../lib/podImposition";
import {
  buildPodPrintManifest,
  hashPodPrintRenderInput,
  serializePodPrintManifest,
  type PodPrintManifest,
  type PodPrintManifestSourceItem,
} from "../lib/podPrintManifest";
import type {
  PodPrintManifestChunk,
  PodPrintManifestHeader,
  PodPrintManifestStore,
  VersionedDocument,
} from "../lib/podPrintManifestPersistence";
import { createPodPrintManifestHandler } from "../../server/routes/pod/print-manifest";
import {
  buildAuthoritativePodPrintManifest,
  resolvePodPublicAssetUrl,
  resolvePodPublicAppUrl,
  type PodPrintManifestSourceReader,
} from "../../server/services/pod-print-manifest";

class RouteManifestStore implements PodPrintManifestStore {
  headers = new Map<string, VersionedDocument<PodPrintManifestHeader>>();
  chunks = new Map<string, VersionedDocument<PodPrintManifestChunk>>();
  version = 0;

  private nextVersion() { this.version += 1; return `v${this.version}`; }
  async readHeader(id: string) { return this.headers.get(id) ?? null; }
  async createHeader(id: string, data: PodPrintManifestHeader) {
    if (this.headers.has(id)) throw new Error("exists_false_conflict");
    this.headers.set(id, { data: structuredClone(data), updateTime: this.nextVersion() });
  }
  async readChunk(id: string) { return this.chunks.get(id) ?? null; }
  async createChunk(id: string, data: PodPrintManifestChunk) {
    if (this.chunks.has(id)) throw new Error("exists_false_conflict");
    this.chunks.set(id, { data: structuredClone(data), updateTime: this.nextVersion() });
  }
  async freezeHeader(id: string, data: Pick<PodPrintManifestHeader, "state" | "frozen_at">, updateTime: string) {
    const current = this.headers.get(id);
    if (!current || current.updateTime !== updateTime) throw new Error("update_time_conflict");
    this.headers.set(id, { data: { ...current.data, ...data }, updateTime: this.nextVersion() });
  }
}

const manifestFor = async (count: number): Promise<PodPrintManifest> => {
  const sources: PodPrintManifestSourceItem[] = [];
  for (let index = 0; index < count; index += 1) {
    const render_input = {
      qr_url: `https://uat.example.test/r/server-${index}`,
      front_text: "Tekst serwera",
      back_qr_label: "Etykieta serwera",
      image_front_url: "https://cdn.example.test/server.jpg",
      image_version: "server-v1",
      photo_author: "Serwer",
      crop_settings: { fit: "auto" },
      country_iso2: "PL",
      country_flag_url: null,
    };
    sources.push({
      id: `item-${index}`,
      print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
      batch_order_index: 0,
      sequence_index: index,
      pod_job_id: "job-a",
      inventory_unit_id: `unit-${index}`,
      card_design_id: "design-a",
      source_order_id: "order-a",
      primary_language_code: "pl",
      secondary_language_code: null,
      render_input,
      render_input_sha256: await hashPodPrintRenderInput(render_input),
    });
  }
  return buildPodPrintManifest(sources, [CURRENT_POSTCARD_PRINT_FORMAT]);
};

const request = (body: Record<string, unknown>) => new Request("https://api.example.test/api/pod/print-manifest", {
  method: "POST",
  headers: { Authorization: "Bearer e30.eyJzdWIiOiJhZG1pbiJ9.signature", "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const baseBody = { batch_id: "batch-a", batch_revision: "1", print_job_ids: ["job-a"] };

describe("POD print manifest server endpoint", () => {
  it("returns 403 when the caller is not an active administrator", async () => {
    const handler = createPodPrintManifestHandler({
      authorize: async () => Response.json({ error: "admin_access_required" }, { status: 403 }),
      buildManifest: async () => { throw new Error("builder_must_not_run"); },
      store: new RouteManifestStore(),
      now: () => "2026-08-29T10:00:00.000Z",
    });
    const response = await handler.fetch(request(baseBody));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "admin_access_required" });
  });

  it("ignores manipulated client render data and passes only trusted job IDs to the server builder", async () => {
    const manifest = await manifestFor(1);
    const buildManifest = vi.fn(async () => manifest);
    const handler = createPodPrintManifestHandler({
      authorize: async () => null,
      buildManifest,
      store: new RouteManifestStore(),
      now: () => "2026-08-29T10:00:00.000Z",
    });
    const response = await handler.fetch(request({
      ...baseBody,
      operation: "freeze",
      geometry: { front_slot: 999 },
      render_input: { front_text: "MANIPULACJA", qr_url: "https://evil.test" },
      languages: ["xx"],
    }));
    expect(response.status).toBe(200);
    expect(buildManifest).toHaveBeenCalledWith({ printJobIds: ["job-a"] });
    const body = await response.json() as Record<string, unknown>;
    expect(body).toHaveProperty("header");
    expect(body).not.toHaveProperty("manifest");
    expect(body).not.toHaveProperty("chunks");
    expect(body).not.toHaveProperty("canonicalJson");
  });

  it("returns the same frozen header for repeated requests", async () => {
    const store = new RouteManifestStore();
    const manifest = await manifestFor(2);
    const handler = createPodPrintManifestHandler({
      authorize: async () => null,
      buildManifest: async () => manifest,
      store,
      now: () => "2026-08-29T10:00:00.000Z",
    });
    const first = await handler.fetch(request({ ...baseBody, operation: "freeze" }));
    const second = await handler.fetch(request({ ...baseBody, operation: "freeze" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(store.headers.size).toBe(1);
  });

  it("reads a large batch as one header followed by paged chunks", async () => {
    const store = new RouteManifestStore();
    const manifest = await manifestFor(205);
    const handler = createPodPrintManifestHandler({
      authorize: async () => null,
      buildManifest: async () => manifest,
      store,
      now: () => "2026-08-29T10:00:00.000Z",
    });
    await handler.fetch(request({ ...baseBody, operation: "freeze" }));
    const headerResponse = await handler.fetch(request({ ...baseBody, operation: "get_header" }));
    const { header } = await headerResponse.json() as { header: PodPrintManifestHeader };
    expect(header.chunk_count).toBeGreaterThan(1);
    const positions = [];
    for (let chunkIndex = 0; chunkIndex < header.chunk_count; chunkIndex += 1) {
      const chunkResponse = await handler.fetch(request({ ...baseBody, operation: "get_chunk", chunk_index: chunkIndex }));
      const body = await chunkResponse.json() as { chunk: PodPrintManifestChunk };
      expect(Object.keys(body)).toEqual(["chunk"]);
      positions.push(...body.chunk.positions);
    }
    expect(positions).toHaveLength(205);
  });
});

describe("authoritative POD manifest source", () => {
  const originalPublicAppUrl = process.env.PUBLIC_APP_URL;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;

  afterEach(() => {
    if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
    if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
  });

  it("requires and validates PUBLIC_APP_URL or FRONTEND_ORIGIN", () => {
    expect(resolvePodPublicAppUrl({ PUBLIC_APP_URL: "https://pod-uat.example.test/" })).toBe("https://pod-uat.example.test");
    expect(resolvePodPublicAppUrl({ FRONTEND_ORIGIN: "https://firebase-uat.example.test" })).toBe("https://firebase-uat.example.test");
    expect(() => resolvePodPublicAppUrl({})).toThrow("manifest_public_app_url_unavailable");
    expect(() => resolvePodPublicAppUrl({ PUBLIC_APP_URL: "not-a-url" })).toThrow("manifest_public_app_url_invalid");
  });

  it("resolves relative print assets against the reviewed public application URL", () => {
    const environment = { PUBLIC_APP_URL: "https://pod-uat.example.test" };
    expect(resolvePodPublicAssetUrl("/card-designs/design-a/front.webp", environment)).toBe(
      "https://pod-uat.example.test/card-designs/design-a/front.webp",
    );
    expect(resolvePodPublicAssetUrl("https://cdn.example.test/front.webp", environment)).toBe(
      "https://cdn.example.test/front.webp",
    );
    expect(resolvePodPublicAssetUrl(null, environment)).toBeNull();
    expect(() => resolvePodPublicAssetUrl("http://cdn.example.test/front.webp", environment)).toThrow(
      "manifest_asset_url_invalid",
    );
  });

  it("builds identifiers and render input only from authoritative server reads", async () => {
    process.env.PUBLIC_APP_URL = "https://pod-uat.example.test";
    const records = new Map<string, Record<string, unknown>>([
      ["qr_print_jobs/job-a", { id: "job-a", status: "ready", total_items: 2, generated_items: 2, order_id: "order-server" }],
      ["inventory_units/unit-1", { id: "unit-1", card_design_id: "design-server", order_id: "order-server", inventory_serial_no: 1, order_item_id: "order-server-0", primary_language_code: "pl" }],
      ["inventory_units/unit-2", { id: "unit-2", card_design_id: "design-server", order_id: "order-server", inventory_serial_no: 2, order_item_id: "order-server-0", primary_language_code: "pl" }],
      ["card_designs/design-server", { id: "design-server", country_id: "country-pl", thank_you_text: "Front serwera", back_qr_label: "Tył serwera", image_front_url: "/card-designs/design-server/front.webp", image_version: "v7", crop_settings: { fit: "crop", x: 40, y: 60 } }],
      ["countries/country-pl", { id: "country-pl", iso2: "PL", flag_url: "https://cdn.test/pl.png" }],
    ]);
    const items = [
      { id: "item-2", print_job_id: "job-a", inventory_unit_id: "unit-2", qr_url: "/r/server-2" },
      { id: "item-1", print_job_id: "job-a", inventory_unit_id: "unit-1", qr_url: "/r/server-1" },
    ];
    const reader: PodPrintManifestSourceReader = {
      read: async (collection, id) => ({ id, ...(records.get(`${collection}/${id}`) || {}) }),
      query: async (collection) => collection === "qr_print_job_items" ? items : [],
    };
    const manifest = await buildAuthoritativePodPrintManifest({ printJobIds: ["job-a"] }, reader);
    const reversedReader: PodPrintManifestSourceReader = {
      ...reader,
      query: async (collection) => collection === "qr_print_job_items" ? [...items].reverse() : [],
    };
    const reversedManifest = await buildAuthoritativePodPrintManifest({ printJobIds: ["job-a"] }, reversedReader);
    const output = manifest.format_groups[0].items;
    expect(output.map((item) => item.inventory_unit_id)).toEqual(["unit-1", "unit-2"]);
    expect(output[0]).toMatchObject({
      format_source: "legacy_fallback_v1",
      source_order_id: "order-server",
      card_design_id: "design-server",
      primary_language_code: "pl",
      render_input: {
        qr_url: "https://pod-uat.example.test/r/server-1",
        front_text: "Front serwera",
        back_qr_label: "Tył serwera",
        image_front_url: "https://pod-uat.example.test/card-designs/design-server/front.webp",
        image_version: "v7",
      },
    });
    expect(serializePodPrintManifest(reversedManifest)).toBe(serializePodPrintManifest(manifest));
  });

  it("uses an explicit inventory format and rejects unknown persisted format identifiers", async () => {
    process.env.PUBLIC_APP_URL = "https://pod-uat.example.test";
    const records = new Map<string, Record<string, unknown>>([
      ["qr_print_jobs/job-a", { id: "job-a", status: "ready", total_items: 1, generated_items: 1, order_id: "order-a" }],
      ["inventory_units/unit-1", { id: "unit-1", card_design_id: "design-a", order_id: "order-a", inventory_serial_no: 1, print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id, print_format_source: "inventory_unit", primary_language_code: "pl" }],
      ["card_designs/design-a", { id: "design-a", country_id: "country-pl" }],
      ["countries/country-pl", { id: "country-pl", iso2: "PL" }],
    ]);
    const reader: PodPrintManifestSourceReader = {
      read: async (collection, id) => ({ id, ...(records.get(`${collection}/${id}`) || {}) }),
      query: async (collection) => collection === "qr_print_job_items"
        ? [{ id: "item-1", print_job_id: "job-a", inventory_unit_id: "unit-1", qr_url: "/r/one" }] : [],
    };
    const manifest = await buildAuthoritativePodPrintManifest({ printJobIds: ["job-a"] }, reader);
    expect(manifest.format_groups[0].items[0].format_source).toBe("inventory_unit");
    records.get("inventory_units/unit-1")!.print_format_source = "legacy_fallback_v1";
    const legacyManifest = await buildAuthoritativePodPrintManifest({ printJobIds: ["job-a"] }, reader);
    expect(legacyManifest.format_groups[0].items[0].format_source).toBe("legacy_fallback_v1");
    records.get("inventory_units/unit-1")!.print_format_id = "unknown-format";
    await expect(buildAuthoritativePodPrintManifest({ printJobIds: ["job-a"] }, reader)).rejects.toThrow(
      "unknown_print_format_id:unknown-format",
    );
  });
});
