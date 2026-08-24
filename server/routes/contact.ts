import { json, preflight } from "../../api/_lib/http.js";

const clean = (value: unknown, maxLength: number) => String(value || "").trim().slice(0, maxLength);

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[char] || char));

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const apiKey = process.env.RESEND_API_KEY || "";
    const from = process.env.CONTACT_FROM_EMAIL || "";
    const to = process.env.CONTACT_TO_EMAIL || "kontakt@podrozowka.pl";
    if (!apiKey || !from) return json({ error: "email_not_configured" }, 503);

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const name = clean(body.name, 120);
    const email = clean(body.email, 254);
    const subject = clean(body.subject, 180);
    const message = clean(body.message, 5000);
    if (!name || !email || !subject || !message || !/^\S+@\S+\.\S+$/.test(email)) {
      return json({ error: "invalid_contact_form" }, 400);
    }

    const html = `<h2>Nowa wiadomość z formularza Podróżówka</h2><p><strong>Od:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><strong>Temat:</strong> ${escapeHtml(subject)}</p><hr><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `[Podróżówka] ${subject}`,
        html,
      }),
        signal: controller.signal,
      });
    } catch (error) {
      console.error("[contact] Resend request failed", error);
      return json({ error: "email_send_failed" }, 502);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      console.error("[contact] Resend rejected request", response.status, await response.text());
      return json({ error: "email_send_failed" }, 502);
    }
    return json({ ok: true });
  },
};
