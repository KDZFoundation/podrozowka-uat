// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, type Firestore } from "firebase/firestore";
import { applicationDefault, cert, deleteApp as deleteAdminApp, getApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

const runIntegration = process.env.RUN_FIRESTORE_INTEGRATION === "1" || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeIntegration = runIntegration ? describe : describe.skip;
const projectId = process.env.FIREBASE_TEST_PROJECT_ID || "podrozowka";
const databaseId = process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";

const makeClient = async (suffix: string) => {
  const app = initializeApp({ apiKey: "fake-api-key", authDomain: `${projectId}.test`, projectId }, `rules-${suffix}-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const firestore = getFirestore(app, databaseId);
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  const credential = await createUserWithEmailAndPassword(auth, `${suffix}-${Date.now()}@example.test`, "password123");
  return { app, auth, firestore, uid: credential.user.uid };
};

describeIntegration("Firestore security rules (emulator)", () => {
  let anonymousApp: FirebaseApp;
  let anonymousDb: Firestore;
  let owner: Awaited<ReturnType<typeof makeClient>>;
  let admin: Awaited<ReturnType<typeof makeClient>>;
  let adminDb: ReturnType<typeof getAdminFirestore>;

  beforeAll(async () => {
    // The Firebase CLI starts the two emulators before this suite runs.
    anonymousApp = initializeApp({ apiKey: "fake-api-key", authDomain: `${projectId}.test`, projectId }, `rules-anonymous-${Date.now()}`);
    anonymousDb = getFirestore(anonymousApp, databaseId);
    connectFirestoreEmulator(anonymousDb, "127.0.0.1", 8080);
    owner = await makeClient("owner");
    admin = await makeClient("admin");
    const adminApp = initializeAdminApp({ projectId }, "rules-admin");
    adminDb = getAdminFirestore(adminApp, databaseId);
    await adminDb.doc(`admin_roles/${admin.uid}`).set({ role: "admin", active: true });
    await adminDb.doc("countries/poland").set({ name: "Polska" });
    await adminDb.doc(`profiles/${owner.uid}`).set({ display_name: "Podróżnik" });
    await adminDb.doc("pod_print_manifests/manifest-rules-test").set({ state: "frozen", manifest_sha256: "abc" });
    await adminDb.doc("pod_print_manifest_chunks/manifest-rules-test-000000").set({ manifest_id: "manifest-rules-test", chunk_index: 0 });
    await adminDb.doc("pod_print_artifacts/artifact-rules-test").set({ immutable: true, status: "ready" });
    await adminDb.doc("pod_print_asset_sets/asset-set-rules-test").set({ state: "frozen" });
    await adminDb.doc("pod_print_asset_set_chunks/asset-set-rules-test-000000").set({ chunk_index: 0 });
    await adminDb.doc("pod_print_asset_set_items/asset-item-rules-test").set({ asset_set_id: "asset-set-rules-test" });
    await adminDb.doc("pod_production_batches/batch-rules-test").set({ state: "FROZEN" });
    await adminDb.doc("pod_production_batch_chunks/batch-rules-test-000000").set({ chunk_index: 0 });
    await adminDb.doc("pod_production_batch_memberships/member-rules-test").set({ batch_id: "batch-rules-test" });
    await adminDb.doc("pod_production_batch_artifacts/artifact-rules-test").set({ immutable: true });
  }, 30_000);

  afterAll(async () => {
    await Promise.all([anonymousApp && deleteApp(anonymousApp), owner?.app && deleteApp(owner.app), admin?.app && deleteApp(admin.app)]);
    await Promise.all(getApps().map((app) => deleteAdminApp(app)));
  });

  it("allows public catalog reads but blocks anonymous catalog writes", async () => {
    const country = await getDoc(doc(anonymousDb, "countries", "poland"));
    expect(country.exists()).toBe(true);
    expect(country.data()).toMatchObject({ name: "Polska" });
    await expect(setDoc(doc(anonymousDb, "countries", "poland"), { name: "Zmodyfikowane" })).rejects.toThrow();
  });

  it("allows a traveler to read their own profile but not another traveler's profile", async () => {
    const profile = await getDoc(doc(owner.firestore, "profiles", owner.uid));
    expect(profile.exists()).toBe(true);
    expect(profile.data()).toMatchObject({ display_name: "Podróżnik" });
    await expect(getDoc(doc(owner.firestore, "profiles", admin.uid))).rejects.toThrow();
  });

  it("allows the active Firebase administrator to maintain protected catalog documents", async () => {
    await expect(setDoc(doc(admin.firestore, "countries", "czechia"), { name: "Czechy" })).resolves.toBeUndefined();
    const country = await getDoc(doc(admin.firestore, "countries", "czechia"));
    expect(country.exists()).toBe(true);
    expect(country.data()).toMatchObject({ name: "Czechy" });
  });

  it("allows only active administrators to read frozen POD manifest documents", async () => {
    expect((await getDoc(doc(admin.firestore, "pod_print_manifests", "manifest-rules-test"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_print_manifest_chunks", "manifest-rules-test-000000"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_print_artifacts", "artifact-rules-test"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_print_asset_sets", "asset-set-rules-test"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_print_asset_set_chunks", "asset-set-rules-test-000000"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_print_asset_set_items", "asset-item-rules-test"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_production_batches", "batch-rules-test"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_production_batch_chunks", "batch-rules-test-000000"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_production_batch_memberships", "member-rules-test"))).exists()).toBe(true);
    expect((await getDoc(doc(admin.firestore, "pod_production_batch_artifacts", "artifact-rules-test"))).exists()).toBe(true);
    await expect(getDoc(doc(owner.firestore, "pod_print_manifests", "manifest-rules-test"))).rejects.toThrow();
    await expect(getDoc(doc(owner.firestore, "pod_print_manifest_chunks", "manifest-rules-test-000000"))).rejects.toThrow();
    await expect(getDoc(doc(owner.firestore, "pod_print_artifacts", "artifact-rules-test"))).rejects.toThrow();
    await expect(getDoc(doc(owner.firestore, "pod_print_asset_sets", "asset-set-rules-test"))).rejects.toThrow();
    await expect(getDoc(doc(owner.firestore, "pod_print_asset_set_chunks", "asset-set-rules-test-000000"))).rejects.toThrow();
    await expect(getDoc(doc(owner.firestore, "pod_print_asset_set_items", "asset-item-rules-test"))).rejects.toThrow();
    await expect(getDoc(doc(anonymousDb, "pod_print_manifests", "manifest-rules-test"))).rejects.toThrow();
    await expect(getDoc(doc(anonymousDb, "pod_print_manifest_chunks", "manifest-rules-test-000000"))).rejects.toThrow();
    await expect(getDoc(doc(anonymousDb, "pod_print_artifacts", "artifact-rules-test"))).rejects.toThrow();
    await expect(getDoc(doc(anonymousDb, "pod_print_asset_sets", "asset-set-rules-test"))).rejects.toThrow();
    await expect(getDoc(doc(anonymousDb, "pod_print_asset_set_chunks", "asset-set-rules-test-000000"))).rejects.toThrow();
    await expect(getDoc(doc(anonymousDb, "pod_print_asset_set_items", "asset-item-rules-test"))).rejects.toThrow();
    for (const [collection, id] of [
      ["pod_production_batches", "batch-rules-test"],
      ["pod_production_batch_chunks", "batch-rules-test-000000"],
      ["pod_production_batch_memberships", "member-rules-test"],
      ["pod_production_batch_artifacts", "artifact-rules-test"],
    ]) {
      await expect(getDoc(doc(owner.firestore, collection, id))).rejects.toThrow();
      await expect(getDoc(doc(anonymousDb, collection, id))).rejects.toThrow();
    }
  });

  it("blocks direct manifest writes from administrators, users, and anonymous clients", async () => {
    for (const firestore of [admin.firestore, owner.firestore, anonymousDb]) {
      await expect(setDoc(doc(firestore, "pod_print_manifests", `client-write-${Date.now()}`), { state: "frozen" })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_print_manifest_chunks", `client-write-${Date.now()}`), { chunk_index: 0 })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_print_artifacts", `client-write-${Date.now()}`), { immutable: true })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_print_asset_sets", `client-write-${Date.now()}`), { state: "frozen" })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_print_asset_set_chunks", `client-write-${Date.now()}`), { chunk_index: 0 })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_print_asset_set_items", `client-write-${Date.now()}`), { asset_role: "print_font" })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_production_batches", `client-write-${Date.now()}`), { state: "FROZEN" })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_production_batch_chunks", `client-write-${Date.now()}`), { chunk_index: 0 })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_production_batch_memberships", `client-write-${Date.now()}`), { batch_id: "other" })).rejects.toThrow();
      await expect(setDoc(doc(firestore, "pod_production_batch_artifacts", `client-write-${Date.now()}`), { immutable: true })).rejects.toThrow();
    }
  });

  it("enforces server-style exists:false, updateTime, and ten concurrent membership claims", async () => {
    const batchRef = adminDb.doc(`pod_production_batches/precondition-${Date.now()}`);
    await expect(batchRef.create({ state: "BUILDING" })).resolves.toBeDefined();
    await expect(batchRef.create({ state: "BUILDING" })).rejects.toThrow();

    const current = await batchRef.get();
    expect(current.updateTime).toBeDefined();
    await expect(batchRef.update({ state: "FROZEN" }, { lastUpdateTime: current.updateTime! })).resolves.toBeDefined();
    await expect(batchRef.update({ state: "BROKEN" }, { lastUpdateTime: current.updateTime! })).rejects.toThrow();

    const membershipRef = adminDb.doc(`pod_production_batch_memberships/concurrent-${Date.now()}`);
    const prefix = Date.now();
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => adminDb.runTransaction(async (transaction) => {
      const membership = await transaction.get(membershipRef);
      if (membership.exists) throw new Error("membership-conflict");
      transaction.create(adminDb.doc(`pod_production_batches/concurrent-${prefix}-${index}`), { state: "BUILDING" });
      transaction.create(membershipRef, { batch_id: `batch-${index}` });
    })));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(9);
  });
});
