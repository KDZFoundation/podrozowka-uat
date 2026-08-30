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
    expect(firestore.createDocumentWrite).toHaveBeenCalledWith(
      expect.stringMatching(/^inventory_units\//),
      expect.objectContaining({
        print_format_id: "postcard-148x105-v1",
        print_format_source: "legacy_fallback_v1",
      }),
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

  it("atomically adds a token and missing print item to an unprinted legacy unit", async () => {
    let jobReads = 0;
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "orders") return { fields: { items: [{ card_design_id: "design-1", quantity: 1 }], user_id: null } };
      if (collection === "qr_print_jobs") {
        jobReads += 1;
        return jobReads === 1 ? staleJob : { fields: { ...staleJob.fields, recovery_lease_id: "lease-test" }, updateTime: "job-v2" };
      }
      if (collection === "card_designs") return { fields: { country_id: "country-1", language_code: "pl" } };
      if (collection === "inventory_units") return {
        fields: { public_claim_code: "QR-EXISTING-00000001" },
        updateTime: "unit-v1",
      };
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
    expect(firestore.updateDocumentWrite).toHaveBeenCalledWith(
      expect.stringMatching(/^inventory_units\//),
      expect.objectContaining({ public_claim_token: expect.any(String), public_claim_token_hash: expect.any(String) }),
      "unit-v1",
    );
    expect(firestore.commitWrites).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ update: expect.stringMatching(/^qr_print_jobs\//) }),
      expect.objectContaining({ update: expect.stringMatching(/^inventory_units\//) }),
      expect.objectContaining({ create: expect.stringMatching(/^qr_print_job_items\//) }),
    ]));
  });

  it("never replaces a legacy claim hash when the printable token cannot be proven", async () => {
    let jobReads = 0;
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "orders") return { fields: { items: [{ card_design_id: "design-1", quantity: 1 }], user_id: null } };
      if (collection === "qr_print_jobs") {
        jobReads += 1;
        return jobReads === 1 ? staleJob : { fields: { ...staleJob.fields, recovery_lease_id: "lease-test" }, updateTime: "job-v2" };
      }
      if (collection === "card_designs") return { fields: { country_id: "country-1", language_code: "pl" } };
      if (collection === "inventory_units") return {
        fields: {
          public_claim_code: "QR-EXISTING-00000001",
          public_claim_token_hash: "existing-hash-without-source-token",
        },
        updateTime: "unit-v1",
      };
      throw new Error(`unexpected ${collection}`);
    });

    await expect(preparePaidOrderPod("orders/order-1", "ORD-1")).rejects.toThrow("pod_inventory_unit_claim_token_unrecoverable");

    expect(firestore.updateDocumentWrite).not.toHaveBeenCalledWith(
      expect.stringMatching(/^inventory_units\//),
      expect.objectContaining({ public_claim_token_hash: expect.any(String) }),
      expect.anything(),
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

    expect(firestore.createDocumentWrite).toHaveBeenCalledWith(
      "notifications/order-order-1-purchase",
      expect.objectContaining({ user_id: "user-1" }),
    );
    expect(firestore.createDocumentWrite).toHaveBeenCalledWith(
      "notifications/order-order-1-rank-Odkrywca",
      expect.objectContaining({ type: "rank_up" }),
    );
  });

  it("does not overwrite an already-read notification while recovering gamification", async () => {
    let notificationCreateAttempted = false;
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "orders") {
        return {
          fields: {
            user_id: "user-1",
            gamification_awarded_at: "2026-01-01T00:00:00.000Z",
            gamification_rank_awarded: "Odkrywca",
            gamification_previous_rank: "Zwiadowca",
          },
        };
      }
      if (collection === "notifications") return { fields: { is_read: true } };
      throw new Error(`unexpected ${collection}`);
    });
    firestore.commitWrites.mockImplementation(async (writes: Array<{ create?: string }>) => {
      if (writes.some((write) => write.create === "notifications/order-order-1-purchase") && !notificationCreateAttempted) {
        notificationCreateAttempted = true;
        throw new Error("already_exists");
      }
      return {};
    });

    await awardPurchaseGamification("orders/order-1", "order-1", 2);

    expect(firestore.updateDocument).not.toHaveBeenCalledWith(
      "notifications/order-order-1-purchase",
      expect.anything(),
    );
    expect(firestore.setDocument).not.toHaveBeenCalled();
  });
});
