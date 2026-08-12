import { buildCorsHeaders } from "../_shared/cors.ts";

const RECIPIENT_EMAIL = "kontakt@podrozowka.pl";
const MAX_FIELD_LENGTH = 4_000;

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function clean(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const payload = await req.json();
    const name = clean(payload.name, 160);
    const email = clean(payload.email, 254).toLowerCase();
    const subject = clean(payload.subject, 200);
    const message = clean(payload.message);

    if (!name || !email || !subject || !message || !/^\S+@\S+\.\S+$/.test(email)) {
      return json(req, { error: "invalid_contact_form" }, 400);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("CONTACT_FROM_EMAIL") || "Podróżówka <kontakt@podrozowka.pl>";
    if (!resendApiKey) {
      console.error("Contact form is missing RESEND_API_KEY");
      return json(req, { error: "email_not_configured" }, 503);
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [RECIPIENT_EMAIL],
        reply_to: email,
        subject: `[Formularz kontaktowy] ${subject}`,
        text: `Imię i nazwisko: ${name}\nE-mail: ${email}\n\nWiadomość:\n${message}`,
      }),
    });

    if (!emailResponse.ok) {
      console.error("Resend contact form error", emailResponse.status, await emailResponse.text());
      return json(req, { error: "email_delivery_failed" }, 502);
    }

    return json(req, { ok: true });
  } catch (error) {
    console.error("Contact form error", error);
    return json(req, { error: "invalid_request" }, 400);
  }
});
