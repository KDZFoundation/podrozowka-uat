import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { firminoRequest, getFirminoConfig, isFirminoCatalogEnabled, readFirminoData, type FirminoArticle } from "../_shared/firmino.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function toGrossPrice(grosze: number): string {
  return (Math.max(0, Number(grosze) || 0) / 100).toFixed(2);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  let designId: string | null = null;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "unauthorized" }, 401);
    const token = authHeader.slice("Bearer ".length);
    const sessionClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await sessionClient.auth.getUser(token);
    if (userError || !user) return respond({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: role } = await admin.from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) return respond({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body.card_design_id !== "string") return respond({ error: "invalid_body" }, 400);

    const { data: design, error: designError } = await admin.from("card_designs")
      .select("id, title, product_code, price_grosze, active, firmino_article_id")
      .eq("id", body.card_design_id).maybeSingle();
    if (designError || !design) return respond({ error: "design_not_found" }, 404);
    designId = design.id;
    if (!design.active) return respond({ error: "design_inactive" }, 409);

    if (!isFirminoCatalogEnabled()) {
      return respond({ ok: true, skipped: "firmino_disabled", product_code: design.product_code });
    }

    const config = getFirminoConfig();
    const articlePayload = {
      name: (design.title || design.product_code).slice(0, 512),
      code: design.product_code,
      type: "good",
      unit: "szt",
      vatRate: config.vatRate,
      priceGross: toGrossPrice(design.price_grosze),
    };

    let articleId = design.firmino_article_id;
    if (!articleId) {
      const findResult = await firminoRequest<unknown>(config, "articles/find", { text: design.product_code, size: 20 });
      const candidates = readFirminoData<FirminoArticle[] | { content?: FirminoArticle[]; list?: FirminoArticle[] }>(findResult);
      const list = Array.isArray(candidates) ? candidates : candidates?.list || candidates?.content || [];
      const existing = list.find((article) => article.code === design.product_code);
      articleId = existing?.id ? Number(existing.id) : null;
    }

    let response: unknown;
    if (articleId) {
      response = await firminoRequest(config, "articles/update", { id: articleId, ...articlePayload });
    } else {
      response = await firminoRequest(config, "articles/add", articlePayload);
      const created = readFirminoData<FirminoArticle>(response);
      articleId = created?.id ? Number(created.id) : null;
    }
    if (!articleId || !Number.isFinite(articleId)) throw new Error("firmino_article_id_missing");

    const { error: updateError } = await admin.from("card_designs").update({
      firmino_article_id: articleId,
      firmino_synced_at: new Date().toISOString(),
      firmino_sync_error: null,
    }).eq("id", design.id);
    if (updateError) throw new Error(`database_update_failed:${updateError.message}`);

    return respond({ ok: true, action: design.firmino_article_id ? "updated" : "created", product_code: design.product_code, article_id: articleId, response });
  } catch (error) {
    const message = (error as Error).message || "internal_error";
    console.error("sync-firmino-article error:", message);
    if (designId) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.from("card_designs").update({ firmino_sync_error: message.slice(0, 500) }).eq("id", designId);
    }
    return respond({ error: message }, 500);
  }
});
