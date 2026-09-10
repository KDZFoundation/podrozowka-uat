import { listDocuments } from "../../../api/_lib/gcp-firestore.js";
import { json, preflight } from "../../../api/_lib/http.js";

// Never spread the source document: it also contains contracts and contacts.
export function publicAuthor(id: string, data: Record<string, unknown>) {
  const text = (key: string) => typeof data[key] === "string" ? data[key] : "";
  return {
    id, slug: text("slug"), name: text("name") || text("display_name"),
    bio: text("bio"), avatar_url: text("avatar_url"),
    website_url: text("website_url"), instagram_url: text("instagram_url"),
    is_active: true,
  };
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    try {
      const authors = await listDocuments("authors", 1000);
      return json({ authors: authors.filter(({ data }) => data.is_active === true)
        .map(({ id, data }) => publicAuthor(id, data)) });
    } catch {
      return json({ error: "authors_unavailable" }, 503);
    }
  },
};
