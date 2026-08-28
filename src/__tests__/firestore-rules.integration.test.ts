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
});
