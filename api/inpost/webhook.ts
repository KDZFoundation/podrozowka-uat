export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    await request.text();
    return Response.json({ received: true });
  },
};
