import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient, GoogleAuth } from "google-auth-library";

type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

type WorkloadIdentityConfig = {
  projectNumber: string;
  serviceAccount: string;
  poolId: string;
  providerId: string;
};

const config = () => {
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const workloadIdentity: WorkloadIdentityConfig | null = projectNumber && serviceAccount && poolId && providerId
    ? { projectNumber, serviceAccount, poolId, providerId }
    : null;

  return {
    // Local development may use the developer's short-lived Application Default
    // Credentials. Production still requires all WIF values and therefore never
    // falls back to a browser/client credential.
    projectId: process.env.GCP_PROJECT_ID || "podrozowka",
    workloadIdentity,
    databaseId: process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f",
  };
};

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
  if ("timestampValue" in value) return String(value.timestampValue);
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
  if (!settings.workloadIdentity) {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/datastore"],
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const token = accessTokenResponse.token;
    if (!token) throw new Error("local_gcp_access_token_unavailable");
    return token;
  }

  const { projectNumber, serviceAccount, poolId, providerId } = settings.workloadIdentity;
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
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

export const firestoreDocumentName = (documentPath: string) => {
  const settings = config();
  return `projects/${settings.projectId}/databases/${settings.databaseId}/documents/${documentPath}`;
};

export const createDocumentWrite = (documentPath: string, data: Record<string, unknown>) => ({
  update: {
    name: firestoreDocumentName(documentPath),
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])),
  },
  currentDocument: { exists: false },
});

export const updateDocumentWrite = (documentPath: string, data: Record<string, unknown>, updateTime?: string) => ({
  update: {
    name: firestoreDocumentName(documentPath),
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])),
  },
  updateMask: { fieldPaths: Object.keys(data) },
  ...(updateTime ? { currentDocument: { updateTime } } : {}),
});

export const updateDocument = async (documentPath: string, data: Record<string, unknown>) => {
  const masks = Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  return firestoreApi(`/${documentPath}?${masks}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])) }),
  });
};

export const setDocument = async (collection: string, id: string, data: Record<string, unknown>) =>
  firestoreApi(`/${collection}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])) }),
  });

export const readDocument = async (collection: string, id: string) =>
  firestoreApi(`/${collection}/${encodeURIComponent(id)}`) as Promise<{
    name: string;
    fields?: Record<string, Record<string, unknown>>;
    updateTime?: string;
  }>;

export const commitWrites = async (writes: unknown[]) =>
  firestoreApi(":commit", {
    method: "POST",
    body: JSON.stringify({ writes }),
  });

/** Atomically update a document only if it has not changed since it was read. */
export const updateDocumentIfCurrent = async (documentPath: string, data: Record<string, unknown>, updateTime: string) =>
  commitWrites([updateDocumentWrite(documentPath, data, updateTime)]);

type QueryOrder = {
  fieldPath: string;
  direction?: "ASCENDING" | "DESCENDING";
};

export const queryDocuments = async (
  collectionId: string,
  fieldPath: string,
  value: FirestoreValue,
  queryLimit = 500,
  order?: QueryOrder,
) => {
  const results = await firestoreApi(":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value } },
        ...(order ? { orderBy: [{ field: { fieldPath: order.fieldPath }, direction: order.direction || "ASCENDING" }] } : {}),
        limit: queryLimit,
      },
    }),
  }) as Array<{ document?: { name: string; fields?: Record<string, Record<string, unknown>>; updateTime?: string } }>;
  return results.flatMap((result) => result.document ? [{
    path: result.document.name.split("/documents/")[1],
    id: result.document.name.split("/").pop() || "",
    data: fromFirestoreFields(result.document.fields),
    name: result.document.name,
    updateTime: result.document.updateTime,
  }] : []);
};

/** Read a bounded public/admin collection through the server-side Firestore API.
 * Client rules intentionally keep inventory and registration collections private,
 * so public pages must use a sanitized server endpoint instead of a direct SDK read.
 */
export const listDocuments = async (collectionId: string, queryLimit = 500) => {
  const results = await firestoreApi(":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        limit: queryLimit,
      },
    }),
  }) as Array<{ document?: { name: string; fields?: Record<string, Record<string, unknown>>; updateTime?: string } }>;
  return results.flatMap((result) => result.document ? [{
    path: result.document.name.split("/documents/")[1],
    id: result.document.name.split("/").pop() || "",
    data: fromFirestoreFields(result.document.fields),
    name: result.document.name,
    updateTime: result.document.updateTime,
  }] : []);
};

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
