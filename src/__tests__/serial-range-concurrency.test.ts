import { describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => {
  let nextSerial: number | null = null;
  let version = 0;
  return {
    commitWrites: vi.fn(async (writes: Array<Record<string, unknown>>) => {
      const write = writes[0] as Record<string, unknown>;
      const precondition = write.currentDocument as Record<string, unknown> | undefined;
      const expectedVersion = precondition?.updateTime as string | undefined;
      if (expectedVersion && expectedVersion !== `v${version}`) throw new Error("stale_update_time");
      if (!expectedVersion && nextSerial !== null) throw new Error("already_exists");
      const update = write.update as Record<string, unknown>;
      const fields = update.fields as Record<string, { integerValue?: string }>;
      nextSerial = Number(fields.next_serial.integerValue);
      version += 1;
      return {};
    }),
    createDocumentWrite: vi.fn((path: string, data: Record<string, unknown>) => ({
      update: { name: path, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { integerValue: String(value) }])) },
    })),
    fromFirestoreFields: vi.fn((fields: Record<string, unknown>) => Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, (value as { integerValue?: string }).integerValue !== undefined
        ? Number((value as { integerValue: string }).integerValue)
        : value]),
    )),
    queryDocuments: vi.fn(async () => []),
    readDocument: vi.fn(async () => {
      await Promise.resolve();
      if (nextSerial === null) return null;
      return { fields: { next_serial: { integerValue: String(nextSerial) } }, updateTime: `v${version}` };
    }),
    updateDocumentWrite: vi.fn((path: string, data: Record<string, unknown>, updateTime?: string) => ({
      update: { name: path, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, { integerValue: String(value) }])) },
      currentDocument: { updateTime },
    })),
  };
});

vi.mock("../../api/_lib/gcp-firestore.js", () => firestore);

import { reserveSerialRange } from "../../api/_lib/pod-order";

describe("serial range allocation concurrency", () => {
  it("allocates non-overlapping ranges for ten parallel requests", async () => {
    const starts = await Promise.all(Array.from({ length: 10 }, () => reserveSerialRange("design-1", 1)));

    expect(new Set(starts).size).toBe(10);
    expect([...starts].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
  });
});
