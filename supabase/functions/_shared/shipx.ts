export const shipxBaseUrl = () =>
  Deno.env.get("INPOST_SHIPX_ENV") === "production"
    ? "https://api-shipx-pl.easypack24.net/v1"
    : "https://sandbox-api-shipx-pl.easypack24.net/v1";

export const shipxCredentials = () => {
  const organizationId = Deno.env.get("INPOST_SHIPX_ORGANIZATION_ID");
  const token = Deno.env.get("INPOST_SHIPX_TOKEN");
  if (!organizationId || !token) {
    throw new Error("Brak konfiguracji INPOST_SHIPX_ORGANIZATION_ID lub INPOST_SHIPX_TOKEN.");
  }
  return { organizationId, token };
};

export const shipxHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export const shipxError = async (response: Response) => {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    return body || response.statusText;
  }
};
