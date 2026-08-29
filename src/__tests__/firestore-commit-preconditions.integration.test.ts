// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDocumentWrite, updateDocumentWrite } from "../../api/_lib/gcp-firestore.js";

const runIntegration = process.env.RUN_FIRESTORE_INTEGRATION === "1" || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeIntegration = runIntegration ? describe : describe.skip;
const projectId = process.env.FIREBASE_TEST_PROJECT_ID || "podrozowka";
const databaseId = process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";
const emulatorHost = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").replace(/^https?:\/\//, "");
const documentsUrl = `http://${emulatorHost}/v1/projects/${projectId}/databases/${databaseId}/documents`;

const emulatorRequest = (path: string, init: RequestInit = {}) => fetch(`${documentsUrl}${path}`, {
  ...init,
  // The emulator treats this magic bearer value as an administrator. The POD
  // server uses privileged IAM credentials in production, so this test must
  // exercise commit preconditions rather than client security rules.
  headers: { Authorization: "Bearer owner", "Content-Type": "application/json", ...(init.headers || {}) },
});

const expectMissing = async (path: string) => {
  const response = await emulatorRequest(`/${path}`);
  expect(response.status).toBe(404);
};

describeIntegration("Firestore REST commit preconditions (emulator)", () => {
  it("rejects every write from a worker that lost the POD recovery lease", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const jobId = `pod-fencing-job-${suffix}`;
    const sequenceId = `pod-fencing-sequence-${suffix}`;
    const unitId = `pod-fencing-unit-${suffix}`;
    const itemId = `pod-fencing-item-${suffix}`;
    const jobPath = `qr_print_jobs/${jobId}`;

    const created = await emulatorRequest(`/qr_print_jobs?documentId=${encodeURIComponent(jobId)}`, {
      method: "POST",
      body: JSON.stringify({
        fields: {
          status: { stringValue: "generating" },
          recovery_lease_id: { stringValue: "worker-a" },
          generated_items: { integerValue: "0" },
        },
      }),
    });
    expect(created.ok).toBe(true);

    const workerAJob = await emulatorRequest(`/${jobPath}`);
    expect(workerAJob.ok).toBe(true);
    const workerAUpdateTime = String((await workerAJob.json()).updateTime || "");
    expect(workerAUpdateTime).not.toBe("");

    const workerBTakeover = await emulatorRequest(":commit", {
      method: "POST",
      body: JSON.stringify({
        writes: [updateDocumentWrite(jobPath, {
          status: "generating",
          recovery_lease_id: "worker-b",
          generated_items: 0,
        }, workerAUpdateTime)],
      }),
    });
    expect(workerBTakeover.ok).toBe(true);

    const staleWorkerCommit = await emulatorRequest(":commit", {
      method: "POST",
      body: JSON.stringify({
        writes: [
          updateDocumentWrite(jobPath, {
            status: "generating",
            recovery_lease_id: "worker-a",
            generated_items: 1,
          }, workerAUpdateTime),
          createDocumentWrite(`inventory_serial_sequences/${sequenceId}`, {
            id: sequenceId,
            card_design_id: "design-fencing-test",
            next_serial: 2,
          }),
          createDocumentWrite(`inventory_units/${unitId}`, {
            id: unitId,
            inventory_serial_no: 1,
          }),
          createDocumentWrite(`qr_print_job_items/${itemId}`, {
            id: itemId,
            print_job_id: jobId,
            inventory_unit_id: unitId,
          }),
        ],
      }),
    });

    expect(staleWorkerCommit.ok).toBe(false);
    expect([400, 409]).toContain(staleWorkerCommit.status);
    await expectMissing(`inventory_serial_sequences/${sequenceId}`);
    await expectMissing(`inventory_units/${unitId}`);
    await expectMissing(`qr_print_job_items/${itemId}`);

    const finalJob = await emulatorRequest(`/${jobPath}`);
    expect(finalJob.ok).toBe(true);
    expect((await finalJob.json()).fields.recovery_lease_id.stringValue).toBe("worker-b");
  });
});
