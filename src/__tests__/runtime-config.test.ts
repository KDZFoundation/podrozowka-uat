// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveFirebaseAuthProjectId, resolveFirestoreRuntimeConfig } from "../../api/_lib/runtime-config";

describe("runtime configuration", () => {
  it("keeps UAT defaults only outside hosted deployments", () => {
    expect(resolveFirestoreRuntimeConfig({})).toEqual({
      projectId: "podrozowka",
      databaseId: "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f",
    });
  });

  it("rejects an incomplete hosted Firestore configuration", () => {
    expect(() => resolveFirestoreRuntimeConfig({ VERCEL: "1", GCP_PROJECT_ID: "podrozowka-production" }))
      .toThrow("firestore_runtime_configuration_missing:FIRESTORE_DATABASE_ID");
  });

  it("requires the Firebase Auth project in hosted deployments", () => {
    expect(() => resolveFirebaseAuthProjectId({ VERCEL_ENV: "production" }))
      .toThrow("firebase_auth_runtime_configuration_missing:FIREBASE_AUTH_PROJECT_ID");
    expect(resolveFirebaseAuthProjectId({ VERCEL: "1", FIREBASE_AUTH_PROJECT_ID: "podrozowka-production" }))
      .toBe("podrozowka-production");
  });
});
