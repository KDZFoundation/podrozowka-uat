import { describe, expect, it } from "vitest";
import { firestoreDocumentsUrl } from "../../api/_lib/gcp-firestore";

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
});
