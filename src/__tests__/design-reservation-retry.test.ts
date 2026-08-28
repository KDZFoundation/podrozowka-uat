import { describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  commitWrites: vi.fn(),
  createDocumentWrite: vi.fn((path: string, data: Record<string, unknown>) => ({ create: path, data })),
  fromFirestoreFields: vi.fn((fields: Record<string, unknown>) => fields),
  listDocuments: vi.fn(),
  readDocument: vi.fn(),
  updateDocumentWrite: vi.fn((path: string, data: Record<string, unknown>, updateTime?: string) => ({ update: path, data, updateTime })),
}));

vi.mock("../../api/_lib/gcp-firestore.js", () => firestore);

import { reserveDesignAvailability } from "../../api/_lib/design-reservation";

describe("design reservation concurrency retry", () => {
  it("re-reads the design snapshot after a stale-version conflict", async () => {
    firestore.listDocuments.mockResolvedValue([]);
    firestore.readDocument.mockImplementation(async (collection: string) => {
      if (collection === "inventory_reservations") throw new Error("not_found");
      if (collection === "card_designs") return {
        fields: { inventory_type: "stock", stock_quantity: 20, reserved_quantity: 0 },
        updateTime: firestore.readDocument.mock.calls.filter(([name]) => name === "card_designs").length === 1
          ? "version-1"
          : "version-2",
      };
      throw new Error("unexpected_collection");
    });
    firestore.commitWrites
      .mockRejectedValueOnce(new Error("stale_update_time"))
      .mockResolvedValueOnce({});

    await expect(reserveDesignAvailability("order-1", [{ card_design_id: "design-1", quantity: 2 }]))
      .resolves.toMatchObject({ id: expect.any(String) });

    expect(firestore.readDocument.mock.calls.filter(([collection]) => collection === "card_designs")).toHaveLength(2);
    expect(firestore.updateDocumentWrite).toHaveBeenLastCalledWith(
      "card_designs/design-1",
      expect.objectContaining({ reserved_quantity: 2 }),
      "version-2",
    );
  });
});
