import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const email = "fundacja@d-arka.org";
const password = "DevAdminPassword123!";

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Seed zablokowany: ustaw FIREBASE_AUTH_EMULATOR_HOST.");
  }
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "podrozowka" });
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, emailVerified: true, displayName: "Administrator Podróżówka" });
  }
  await firestore.collection("admin_roles").doc(user.uid).set({
    user_id: user.uid,
    email,
    role: "admin",
    active: true,
    granted_by: "local-emulator-seed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { merge: true });
  console.log(`Lokalne konto administratora gotowe: ${email} (${user.uid}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
