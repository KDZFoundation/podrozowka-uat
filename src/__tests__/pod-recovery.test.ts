import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  commitWrites: vi.fn(),
  createDocumentWrite: vi.fn((path: string, data: Record<string, unknown>) => ({ create: path, data })),
  fromFirestoreFields: vi.fn((fields: Record<string, unknown>) => fields),
  queryDocuments: vi.fn(),
  readDocument: vi.fn(),
  setDocument: vi.fn(),
  updateDocument: vi.fn(),
  updateDocumentIfCurrent: vi.fn(),
  updateDocumentWrite: vi.fn((path: string, data: Record<string, unknown>) => ({ update: path, data })),
}));

vi.mock("../../api/_lib/gcp-firestore.js", () => firestore);

import { awardPurchaseGamification, preparePaidOrderPod } from "../../api/_lib/pod-order";

const staleJob = {
  fields: {
    status: "generating",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  updateTime: "job-v1",
};

describe("POD recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("lease-test");
    firestore.commitWrites.mockResolvedValue({});
    firestore.setDocument.mockResolvedValue({});
    firestore.updateDocument.mockResolvedValue({});
    firestore.updateDocumentIfCurrent.mockResolvedValue({});
    firestore.queryDocuments.mockImplementation(async (collection: string) => {
      if (collection === "card_language_templates") return [{ data: { language_code: "pl", is_primary: true } }];
      return [];
    });
  });

  it("resumes a stale job without trying to create its existing lock again", async () => {
    let jobReads = 0;
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "orders") return { fields: { items: [{ card_design_id: "design-1", quantity: 1 }], user_id: null } };
      if (collection === "qr_print_jobs") {
        jobReads += 1;
        return jobReads === 1 ? staleJob : { fields: { ...staleJob.fields, recovery_lease_id: "lease-test" }, updateTime: "job-v2" };
      }
      if (collection === "card_designs") return { fields: { country_id: "country-1", language_code: "pl" } };
      if (collection === "inventory_units") throw new Error("not_found");
      if (collection === "inventory_serial_sequences") throw new Error("not_found");
      throw new Error(`unexpected ${collection}`);
    });

    await expect(preparePaidOrderPod("orders/order-1", "ORD-1")).resolves.toBeTruthy();

    expect(firestore.createDocumentWrite).not.toHaveBeenCalledWith(
      expect.stringMatching(/^qr_print_jobs\//),
      expect.anything(),
    );
    expect(firestore.updateDocument).toHaveBeenCalledWith(
      "orders/order-1",
      expect.objectContaining({ pod_status: "ready" }),
    );
  });

  it("repairs the order when a previous run already completed the job", async () => {
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "orders") return { fields: { items: [{ card_design_id: "design-1", quantity: 1 }], user_id: null } };
      if (collection === "qr_print_jobs") return { fields: { status: "ready" } };
      throw new Error(`unexpected ${collection}`);
    });

    await preparePaidOrderPod("orders/order-1", "ORD-1");

    expect(firestore.updateDocument).toHaveBeenCalledWith(
      "orders/order-1",
      expect.objectContaining({ pod_status: "ready", qr_print_job_id: expect.any(String) }),
    );
  });

  it("treats a malformed heartbeat as recoverable when the original job is old", async () => {
    let jobReads = 0;
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "orders") return { fields: { items: [{ card_design_id: "design-1", quantity: 1 }], user_id: null } };
      if (collection === "qr_print_jobs") return {
        fields: jobReads++ === 0
          ? { ...staleJob.fields, updated_at: "not-a-date" }
          : { ...staleJob.fields, updated_at: "not-a-date", recovery_lease_id: "lease-test" },
        updateTime: "job-v1",
      };
      if (collection === "card_designs") return { fields: { country_id: "country-1", language_code: "pl" } };
      if (collection === "inventory_units") throw new Error("not_found");
      if (collection === "inventory_serial_sequences") throw new Error("not_found");
      throw new Error(`unexpected ${collection}`);
    });

    await expect(preparePaidOrderPod("orders/order-1", "ORD-1")).resolves.toBeTruthy();

    expect(firestore.updateDocumentIfCurrent).toHaveBeenCalledWith(
      expect.stringMatching(/^qr_print_jobs\//),
      expect.objectContaining({ recovery_started_at: expect.any(String) }),
      "job-v1",
    );
  });

  it("keeps an already-created inventory unit and only recreates its missing print item", async () => {
    let jobReads = 0;
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "orders") return { fields: { items: [{ card_design_id: "design-1", quantity: 1 }], user_id: null } };
      if (collection === "qr_print_jobs") {
        jobReads += 1;
        return jobReads === 1 ? staleJob : { fields: { ...staleJob.fields, recovery_lease_id: "lease-test" }, updateTime: "job-v2" };
      }
      if (collection === "card_designs") return { fields: { country_id: "country-1", language_code: "pl" } };
      if (collection === "inventory_units") return { fields: { public_claim_code: "QR-EXISTING-00000001" } };
      throw new Error(`unexpected ${collection}`);
    });

    await preparePaidOrderPod("orders/order-1", "ORD-1");

    expect(firestore.createDocumentWrite).not.toHaveBeenCalledWith(
      expect.stringMatching(/^inventory_units\//),
      expect.anything(),
    );
    expect(firestore.createDocumentWrite).toHaveBeenCalledWith(
      expect.stringMatching(/^qr_print_job_items\//),
      expect.objectContaining({ public_claim_code: "QR-EXISTING-00000001" }),
    );
    expect(firestore.updateDocument).toHaveBeenCalledWith(
      expect.stringMatching(/^inventory_units\//),
      expect.objectContaining({ public_claim_token: expect.any(String), public_claim_token_hash: expect.any(String) }),
    );
  });

  it("recreates deterministic notifications after points were already awarded", async () => {
    firestore.readDocument.mockResolvedValue({
      fields: {
        user_id: "user-1",
        gamification_awarded_at: "2026-01-01T00:00:00.000Z",
        gamification_rank_awarded: "Odkrywca",
        gamification_previous_rank: "Zwiadowca",
      },
    });

    await awardPurchaseGamification("orders/order-1", "order-1", 2);

    expect(firestore.setDocument).toHaveBeenCalledWith(
      "notifications",
      "order-order-1-purchase",
      expect.objectContaining({ user_id: "user-1" }),
    );
    expect(firestore.setDocument).toHaveBeenCalledWith(
      "notifications",
      "order-order-1-rank-Odkrywca",
      expect.objectContaining({ type: "rank_up" }),
    );
  });
});
