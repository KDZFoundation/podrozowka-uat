export type FirestoreRuntimeConfig = {
  projectId: string;
  databaseId: string;
};

const UAT_PROJECT_ID = "podrozowka";
const UAT_DATABASE_ID = "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";

const configured = (environment: NodeJS.ProcessEnv, name: string) => environment[name]?.trim() || "";

/**
 * A serverless deployment must never silently use the UAT project merely
 * because one of its environment variables was omitted. Local development and
 * tests retain the documented UAT defaults so the emulator bootstrap remains
 * reproducible without credentials.
 */
export const isHostedRuntime = (environment: NodeJS.ProcessEnv = process.env) =>
  environment.VERCEL === "1" || Boolean(configured(environment, "VERCEL_ENV"));

export const resolveFirestoreRuntimeConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): FirestoreRuntimeConfig => {
  const projectId = configured(environment, "GCP_PROJECT_ID");
  const databaseId = configured(environment, "FIRESTORE_DATABASE_ID");

  if (isHostedRuntime(environment) && (!projectId || !databaseId)) {
    const missing = [!projectId && "GCP_PROJECT_ID", !databaseId && "FIRESTORE_DATABASE_ID"].filter(Boolean).join(",");
    throw new Error(`firestore_runtime_configuration_missing:${missing}`);
  }

  return {
    projectId: projectId || UAT_PROJECT_ID,
    databaseId: databaseId || UAT_DATABASE_ID,
  };
};

export const resolveFirebaseAuthProjectId = (environment: NodeJS.ProcessEnv = process.env) => {
  const projectId = configured(environment, "FIREBASE_AUTH_PROJECT_ID") || configured(environment, "GCP_PROJECT_ID");
  if (isHostedRuntime(environment) && !projectId) {
    throw new Error("firebase_auth_runtime_configuration_missing:FIREBASE_AUTH_PROJECT_ID");
  }
  return projectId || UAT_PROJECT_ID;
};
