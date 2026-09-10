import { expect, it, vi } from "vitest";
const listDocuments = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/gcp-firestore.js", () => ({ listDocuments }));
import handler from "../../server/routes/public/authors";

it("publishes only active author metadata, never private or future fields", async () => {
  listDocuments.mockResolvedValue([
    { id: "author", data: { is_active: true, name: "Autor", email: "private@example.test", legal_name: "Private",
      agreement: "secret", notes: "secret", future_private_field: "secret" } },
    { id: "inactive", data: { is_active: false, name: "Hidden" } },
  ]);
  const response = await handler.fetch(new Request("https://example.test/api/public/authors"));
  expect(await response.json()).toEqual({ authors: [{ id: "author", name: "Autor", slug: "", bio: "",
    avatar_url: "", website_url: "", instagram_url: "", is_active: true }] });
});
