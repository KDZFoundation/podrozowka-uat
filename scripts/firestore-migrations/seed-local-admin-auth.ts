import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = "fundacja@d-arka.org";
const password = "DevAdminPassword123!";

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Seed zablokowany: ustaw FIREBASE_AUTH_EMULATOR_HOST.");
  }
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "podrozowka" });
  const auth = getAuth(app);
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, emailVerified: true, displayName: "Administrator Podróżówka" });
  }
  await auth.setCustomUserClaims(user.uid, { admin: true, role: "admin" });
  console.log(`Lokalne konto administratora gotowe: ${email} (${user.uid}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
