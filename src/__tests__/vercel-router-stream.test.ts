// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { streamWebResponse } from "../../server/vercel-router";

describe("Vercel Web Response streaming", () => {
  it("pipes response chunks without materializing the complete payload", async () => {
    const chunks: Buffer[] = [];
    let ended = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("first-"));
        controller.enqueue(new TextEncoder().encode("second"));
        controller.close();
      },
    }));
    const arrayBuffer = vi.spyOn(response, "arrayBuffer").mockRejectedValue(new Error("must_not_buffer"));
    await streamWebResponse(response, {
      setHeader: vi.fn(),
      write: (chunk) => {
        chunks.push(chunk);
        return true;
      },
      once: vi.fn(),
      end: () => {
        ended = true;
      },
    });
    expect(Buffer.concat(chunks).toString("utf8")).toBe("first-second");
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(ended).toBe(true);
  });
});
