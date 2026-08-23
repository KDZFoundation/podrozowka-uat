import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";

type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing_environment_${name}`);
  return value;
};

const config = () => ({
  projectId: required("GCP_PROJECT_ID"),
  projectNumber: required("GCP_PROJECT_NUMBER"),
  serviceAccount: required("GCP_SERVICE_ACCOUNT_EMAIL"),
  poolId: required("GCP_WORKLOAD_IDENTITY_POOL_ID"),
  providerId: required("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"),
  databaseId: process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f",
});

export const firestoreDocumentsUrl = (projectId: string, databaseId: string, path: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents${path}`;

export const toFirestoreValue = (value: unknown): FirestoreValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) fields[key] = toFirestoreValue(nested);
    return { mapValue: { fields } };
  }
  throw new Error("unsupported_firestore_value");
};

export const fromFirestoreValue = (value: Record<string, unknown>): unknown => {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return String(value.stringValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: Record<string, unknown>[] }).values || [];
    return values.map(fromFirestoreValue);
  }
  if ("mapValue" in value) {
    const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields || {};
    return Object.fromEntries(Object.entries(fields).map(([key, nested]) => [key, fromFirestoreValue(nested)]));
  }
  return null;
};

export const fromFirestoreFields = (fields: Record<string, Record<string, unknown>> = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));

const accessToken = async () => {
  const settings = config();
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${settings.projectNumber}/locations/global/workloadIdentityPools/${settings.poolId}/providers/${settings.providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${settings.serviceAccount}:generateAccessToken`,
    // google-auth-library calls a supplier with its own context argument.
    // Passing getVercelOidcToken directly made that context get interpreted as
    // Vercel OIDC options, causing Vercel to mint a token for the Google WIF
    // provider audience rather than its configured team audience. Keep the
    // supplier zero-argument so we exchange the original Vercel token.
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  const accessTokenResponse = await client.getAccessToken();
  const token = accessTokenResponse.token;
  if (!token) throw new Error("gcp_access_token_unavailable");
  return token;
};

export const firestoreApi = async (path: string, init: RequestInit = {}) => {
  const settings = config();
  const token = await accessToken();
  const response = await fetch(
    firestoreDocumentsUrl(settings.projectId, settings.databaseId, path),
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`firestore_${response.status}:${JSON.stringify(body)}`);
  return body;
};

export const writeDocument = async (collection: string, id: string, data: Record<string, unknown>) =>
  firestoreApi(`/${collection}?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])) }),
  });

export const updateDocument = async (documentPath: string, data: Record<string, unknown>) => {
  const masks = Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  return firestoreApi(`/${documentPath}?${masks}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])) }),
  });
};

export const readDocument = async (collection: string, id: string) =>
  firestoreApi(`/${collection}/${encodeURIComponent(id)}`) as Promise<{ name: string; fields?: Record<string, Record<string, unknown>> }>;

export const findOrdersByNumber = async (orderNumber: string) => {
  const query = await firestoreApi(":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        where: { fieldFilter: { field: { fieldPath: "order_number" }, op: "EQUAL", value: { stringValue: orderNumber } } },
        limit: 1,
      },
    }),
  }) as Array<{ document?: { name: string } }>;
  return query
    .map((result) => result.document?.name?.split("/documents/")[1] || null)
    .filter((path): path is string => Boolean(path));
};

export const findOrderByNumber = async (orderNumber: string) =>
  (await findOrdersByNumber(orderNumber))[0] || null;
