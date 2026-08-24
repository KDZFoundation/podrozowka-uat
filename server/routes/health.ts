export default {
  fetch: () => Response.json({ status: "ok", service: "podrozowka-uat-api", timestamp: new Date().toISOString() }),
};
