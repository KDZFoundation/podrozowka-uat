import { describe, expect, it } from "vitest";
import {
  derivePodProductionReleaseEventId,
  derivePodProductionReleaseId,
  nextPodProductionReleaseStatus,
} from "./podProductionRelease";

describe("POD production release state machine", () => {
  it("derives stable release and idempotency event identities", async () => {
    await expect(derivePodProductionReleaseId("batch-a")).resolves.toBe(await derivePodProductionReleaseId("batch-a"));
    await expect(derivePodProductionReleaseEventId("release-a", "retry-a")).resolves.toBe(
      await derivePodProductionReleaseEventId("release-a", "retry-a"),
    );
  });

  it("allows only the explicit forward and cancellation transitions", () => {
    expect(nextPodProductionReleaseStatus("DRAFT", "MARKED_READY")).toBe("READY");
    expect(nextPodProductionReleaseStatus("READY", "RELEASED_TO_PRINTER")).toBe("RELEASED_TO_PRINTER");
    expect(nextPodProductionReleaseStatus("DRAFT", "CANCELLED")).toBe("CANCELLED");
    expect(() => nextPodProductionReleaseStatus("DRAFT", "RELEASED_TO_PRINTER")).toThrow(
      "pod_release_transition_invalid:DRAFT:RELEASED_TO_PRINTER",
    );
    expect(() => nextPodProductionReleaseStatus("RELEASED_TO_PRINTER", "CANCELLED")).toThrow();
  });
});
