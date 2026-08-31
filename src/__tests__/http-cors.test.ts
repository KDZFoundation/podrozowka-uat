// @vitest-environment node
import { describe, expect, it } from "vitest";
import { corsHeaders } from "../../api/_lib/http";

describe("API CORS response headers", () => {
  it("exposes POD integrity headers to the Firebase Hosting frontend", () => {
    const exposed = new Set(corsHeaders["Access-Control-Expose-Headers"].split(", ").map((value) => value.toLowerCase()));

    expect(exposed).toContain("x-pod-asset-sha256");
    expect(exposed).toContain("x-pod-storage-generation");
    expect(exposed).toContain("x-pod-pdf-sha256");
  });
});
