const FIRMINO_BASE_URL = "https://app.firmino.pl/app/services/rest/api";

export type FirminoConfig = {
  login: string;
  password: string;
  companyShortName?: string;
  vatRate: string;
};

export type FirminoArticle = {
  id?: number | string;
  code?: string;
  name?: string;
};

function normalize(value: string | undefined): string {
  return (value || "").trim();
}

function enabled(name: string): boolean {
  return normalize(Deno.env.get(name)).toLowerCase() === "true";
}

/**
 * Catalog synchronization is intentionally separate from issuing sales
 * documents.  The legacy FIRMINO_ENABLED flag remains an alias during the
 * rollout, so an already configured development environment keeps working.
 */
export function isFirminoCatalogEnabled(): boolean {
  return enabled("FIRMINO_CATALOG_ENABLED") || enabled("FIRMINO_ENABLED");
}

/** Sales documents are opt-in, even when the catalog integration is active. */
export function isFirminoSalesEnabled(): boolean {
  return enabled("FIRMINO_SALES_ENABLED");
}

export function getFirminoConfig(): FirminoConfig {
  const login = normalize(Deno.env.get("FIRMINO_LOGIN"));
  const password = normalize(Deno.env.get("FIRMINO_PASSWORD"));
  const vatRate = normalize(Deno.env.get("FIRMINO_VAT_RATE"));

  if (!login || !password) throw new Error("firmino_credentials_missing");
  if (!vatRate) throw new Error("firmino_vat_rate_missing");

  return {
    login,
    password,
    vatRate,
    companyShortName: normalize(Deno.env.get("FIRMINO_COMPANY_SHORT_NAME")) || undefined,
  };
}

export async function firminoRequest<T>(
  config: FirminoConfig,
  resource: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${config.login}:${config.password}`)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.companyShortName) headers.companyShortName = config.companyShortName;

  const response = await fetch(`${FIRMINO_BASE_URL}/${resource.replace(/^\/+/, "")}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: unknown = raw;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // Keep a short textual response below; it is useful when Firmino returns a proxy error.
  }

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "response" in payload
      ? String((payload as { response?: unknown }).response)
      : raw;
    throw new Error(`firmino_http_${response.status}:${message.slice(0, 300)}`);
  }

  if (typeof payload === "object" && payload && "success" in payload && (payload as { success?: unknown }).success === false) {
    throw new Error(`firmino_api_error:${String((payload as { response?: unknown }).response || "unknown").slice(0, 300)}`);
  }

  return payload as T;
}

export function readFirminoData<T>(payload: unknown): T {
  if (typeof payload === "object" && payload && "response" in payload) {
    return (payload as { response: T }).response;
  }
  return payload as T;
}
