import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POD_CRON_SECRET = Deno.env.get("POD_CRON_SECRET");

type OrderRow = {
  id: string;
  order_number: string;
  paid_at: string | null;
  shipping_method: string | null;
  shipping_name: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  shipping_postal_code: string | null;
  shipping_city: string | null;
  pickup_point_code: string | null;
  pickup_point_name: string | null;
  pickup_point_address: string | null;
  pickup_point_city: string | null;
};

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

const todayInWarsaw = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const todayInWarsawFor = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const body = await req.json().catch(() => ({}));
    const operation = typeof body.operation === "string" ? body.operation : "list";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const isCron = Boolean(POD_CRON_SECRET) && req.headers.get("x-pod-cron-secret") === POD_CRON_SECRET;
    let userId: string | null = null;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (!authHeader || !token) return json({ error: "unauthorized" }, 401, corsHeaders);
      const authenticated = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user } } = await authenticated.auth.getUser(token);
      if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!role) return json({ error: "forbidden" }, 403, corsHeaders);
      userId = user.id;
    }

    if (operation === "list") {
      const { data, error } = await admin
        .from("pod_production_batches")
        .select("*, pod_production_batch_orders(*)")
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return json({ batches: data ?? [] }, 200, corsHeaders);
    }

    if (operation === "mark_sent") {
      const batchId = typeof body.batch_id === "string" ? body.batch_id : "";
      if (!batchId) return json({ error: "batch_id_required" }, 400, corsHeaders);
      const { error } = await admin.from("pod_production_batches").update({
        status: "sent_to_printer",
        sent_to_printer_at: new Date().toISOString(),
        printer_email: typeof body.printer_email === "string" ? body.printer_email.trim() || null : null,
      }).eq("id", batchId);
      if (error) throw error;
      return json({ success: true }, 200, corsHeaders);
    }

    if (operation !== "create" && operation !== "create_daily") {
      return json({ error: "invalid_operation" }, 400, corsHeaders);
    }

    const productionDate = typeof body.production_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.production_date)
      ? body.production_date
      : todayInWarsaw();
    const requestedIds = Array.isArray(body.order_ids)
      ? body.order_ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : [];
    const { data: existingLinks, error: linksError } = await admin.from("pod_production_batch_orders").select("order_id");
    if (linksError) throw linksError;
    const alreadyBatched = new Set((existingLinks ?? []).map((row: { order_id: string }) => row.order_id));

    let ordersQuery = admin.from("orders").select("id, order_number, paid_at, shipping_method, shipping_name, customer_email, shipping_address, shipping_postal_code, shipping_city, pickup_point_code, pickup_point_name, pickup_point_address, pickup_point_city").eq("payment_status", "paid");
    if (requestedIds.length > 0) {
      ordersQuery = ordersQuery.in("id", requestedIds);
    }
    const { data: ordersData, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;
    const candidates = ((ordersData ?? []) as OrderRow[]).filter((order) => {
      const wasPaidOnProductionDate = requestedIds.length > 0
        || (order.paid_at && todayInWarsawFor(new Date(order.paid_at)) === productionDate);
      return wasPaidOnProductionDate && !alreadyBatched.has(order.id);
    });
    if (candidates.length === 0) return json({ error: "no_ready_paid_orders" }, 409, corsHeaders);

    const { data: jobsData, error: jobsError } = await admin
      .from("qr_print_jobs")
      .select("id, order_id, total_items, generated_items, status")
      .in("order_id", candidates.map((order) => order.id))
      .eq("status", "ready");
    if (jobsError) throw jobsError;
    const jobsByOrderId = new Map<string, { id: string; total_items: number; generated_items: number }>();
    for (const job of jobsData ?? []) {
      if (job.total_items > 0 && job.total_items === job.generated_items && !jobsByOrderId.has(job.order_id)) {
        jobsByOrderId.set(job.order_id, job);
      }
    }
    const eligible = candidates.filter((order) => jobsByOrderId.has(order.id));
    const skippedOrderNumbers = candidates.filter((order) => !jobsByOrderId.has(order.id)).map((order) => order.order_number);
    if (eligible.length === 0) return json({ error: "no_orders_with_ready_qr", skipped_order_numbers: skippedOrderNumbers }, 409, corsHeaders);

    const { data: dayBatches, error: countError } = await admin.from("pod_production_batches").select("id").eq("production_date", productionDate);
    if (countError) throw countError;
    const batchNumber = `POD-${productionDate.replaceAll("-", "")}-${String((dayBatches?.length ?? 0) + 1).padStart(2, "0")}`;
    const totalPostcards = eligible.reduce((sum, order) => sum + (jobsByOrderId.get(order.id)?.total_items ?? 0), 0);
    const { data: batch, error: batchError } = await admin.from("pod_production_batches").insert({
      batch_number: batchNumber,
      production_date: productionDate,
      status: "queued",
      total_orders: eligible.length,
      total_postcards: totalPostcards,
      created_by: userId,
      scheduled_for: operation === "create_daily" ? new Date().toISOString() : null,
    }).select().single();
    if (batchError) throw batchError;

    const manifestRows = eligible.map((order) => {
      const job = jobsByOrderId.get(order.id)!;
      return {
        batch_id: batch.id,
        order_id: order.id,
        print_job_id: job.id,
        order_number: order.order_number,
        postcard_count: job.total_items,
        shipping_method: order.shipping_method ?? "courier",
        recipient_name: order.shipping_name,
        recipient_email: order.customer_email,
        recipient_street: order.shipping_address,
        recipient_postal_code: order.shipping_postal_code,
        recipient_city: order.shipping_city,
        pickup_point_code: order.pickup_point_code,
        pickup_point_name: order.pickup_point_name,
        pickup_point_address: order.pickup_point_address,
        pickup_point_city: order.pickup_point_city,
      };
    });
    const { error: manifestError } = await admin.from("pod_production_batch_orders").insert(manifestRows);
    if (manifestError) {
      await admin.from("pod_production_batches").delete().eq("id", batch.id);
      throw manifestError;
    }
    return json({ batch, skipped_order_numbers: skippedOrderNumbers }, 201, corsHeaders);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500, corsHeaders);
  }
});
