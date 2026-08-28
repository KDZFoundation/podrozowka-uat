import { describe, expect, it } from "vitest";
import { createDocumentWrite, firestoreDocumentsUrl, updateDocumentWrite } from "../../api/_lib/gcp-firestore";

describe("Firestore REST document paths", () => {
  it("adds the documents segment exactly once", () => {
    expect(firestoreDocumentsUrl("podrozowka", "uat-db", "/card_designs/design-1")).toBe(
      "https://firestore.googleapis.com/v1/projects/podrozowka/databases/uat-db/documents/card_designs/design-1",
    );
  });

  it("builds the runQuery endpoint from the documents root", () => {
    expect(firestoreDocumentsUrl("podrozowka", "uat-db", ":runQuery")).toBe(
      "https://firestore.googleapis.com/v1/projects/podrozowka/databases/uat-db/documents:runQuery",
    );
  });

  it("uses Firestore preconditions for atomic create and compare-and-set writes", () => {
    expect(createDocumentWrite("orders/order-1", { status: "new" })).toMatchObject({
      currentDocument: { exists: false },
      update: { name: expect.stringContaining("/documents/orders/order-1") },
    });
    expect(updateDocumentWrite("orders/order-1", { payment_status: "paid" }, "version-1")).toMatchObject({
      currentDocument: { updateTime: "version-1" },
      updateMask: { fieldPaths: ["payment_status"] },
    });
  });
});
