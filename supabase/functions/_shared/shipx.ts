import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const shipxBaseUrl = (environment = Deno.env.get("INPOST_SHIPX_ENV")) =>
  environment === "production"
    ? "https://api-shipx-pl.easypack24.net/v1"
    : "https://sandbox-api-shipx-pl.easypack24.net/v1";

export const shipxCredentials = async (supabase: SupabaseClient) => {
  const { data } = await supabase
    .from("shipping_settings")
    .select("inpost_environment, inpost_organization_id, inpost_api_token")
    .eq("singleton", true)
    .maybeSingle();
  const organizationId = data?.inpost_organization_id || Deno.env.get("INPOST_SHIPX_ORGANIZATION_ID");
  const token = data?.inpost_api_token || Deno.env.get("INPOST_SHIPX_TOKEN");
  if (!organizationId || !token) {
    throw new Error("Brak konfiguracji INPOST_SHIPX_ORGANIZATION_ID lub INPOST_SHIPX_TOKEN.");
  }
  return { organizationId, token, environment: data?.inpost_environment || Deno.env.get("INPOST_SHIPX_ENV") || "sandbox" };
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
