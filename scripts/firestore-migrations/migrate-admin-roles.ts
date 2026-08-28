import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * One-time migration from the retired e-mail allow-list to Firestore roles.
 *
 * First run without --apply to inspect resolved Firebase users. Run again
 * with --apply before publishing firestore.rules, so existing administrators
 * never lose panel access during the switch.
 */

const PROJECT_ID = process.env.GCLOUD_PROJECT || "podrozowka";
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";
const apply = process.argv.includes("--apply");

// These are only migration input, not runtime authorization. After this
// script runs, the admin_roles collection is the sole access source.
const initialAdminEmails = [
  "fundacja@d-arka.org",
  "dariusz.pgry@gmail.com",
  "fundacja@konopiedlaziemi.org",
];

async function main() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth(app);
  const firestore = getFirestore(app, DATABASE_ID);
  // Fail before printing a misleading "account not found" message when the
  // local Google Application Default Credentials have expired.
  await auth.listUsers(1);
  const timestamp = new Date().toISOString();
  let resolved = 0;
  let missing = 0;

  for (const email of initialAdminEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      resolved += 1;
      console.log(`${apply ? "Utworzę" : "Utworzyłbym"} admin_roles/${user.uid} (${email}).`);
      if (apply) {
        await firestore.collection("admin_roles").doc(user.uid).set({
          user_id: user.uid,
          email,
          role: "admin",
          active: true,
          granted_by: "migration:email-allow-list",
          created_at: timestamp,
          updated_at: timestamp,
        }, { merge: true });
      }
    } catch (error) {
      missing += 1;
      console.warn(`Nie znaleziono konta Firebase dla ${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!apply) {
    console.log("Podgląd zakończony. Ponów z --apply, aby zapisać role.");
  } else {
    console.log(`Migracja ról zakończona: ${resolved} zapisanych, ${missing} pominiętych.`);
  }
  if (resolved === 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
