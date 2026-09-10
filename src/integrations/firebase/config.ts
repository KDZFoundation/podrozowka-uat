import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseAppletConfig from "../../../firebase-applet-config.json";

const configuredFirebaseValues = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configuredFirebaseValueList = Object.values(configuredFirebaseValues).map((value) => value?.trim() || "");
const hasAnyConfiguredFirebaseValue = configuredFirebaseValueList.some(Boolean);
const hasCompleteConfiguredFirebaseValueSet = configuredFirebaseValueList.every(Boolean);
const isProductionRuntime = import.meta.env.VITE_APP_ENV === "production" || import.meta.env.MODE === "production";

if (hasAnyConfiguredFirebaseValue && !hasCompleteConfiguredFirebaseValueSet) {
  throw new Error("firebase_client_configuration_incomplete");
}

// The committed applet configuration is the reviewed UAT fallback. A production
// build must supply all values explicitly, otherwise it could silently connect
// to UAT when a single deployment variable is absent.
if (isProductionRuntime && !hasCompleteConfiguredFirebaseValueSet) {
  throw new Error("firebase_client_configuration_missing_for_production");
}

const firebaseConfig = {
  apiKey: configuredFirebaseValues.apiKey || firebaseAppletConfig.apiKey,
  authDomain: configuredFirebaseValues.authDomain || firebaseAppletConfig.authDomain,
  projectId: configuredFirebaseValues.projectId || firebaseAppletConfig.projectId,
  storageBucket: configuredFirebaseValues.storageBucket || firebaseAppletConfig.storageBucket,
  messagingSenderId: configuredFirebaseValues.messagingSenderId || firebaseAppletConfig.messagingSenderId,
  appId: configuredFirebaseValues.appId || firebaseAppletConfig.appId,
};

// Initialize Firebase safely without re-initializing during hot-reload
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = firebaseAppletConfig.firestoreDatabaseId && firebaseAppletConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(app, firebaseAppletConfig.firestoreDatabaseId)
  : getFirestore(app);
export const storage = getStorage(app);

// Local catalog migration is tested against emulators only when explicitly
// enabled. This flag is never set in Firebase Hosting production builds.
export const isUsingFirebaseEmulators =
  import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";

// UAT can read the migrated catalog directly from the remote Firestore while
// the remaining operational areas are still being migrated separately.
export const isFirestoreCatalogEnabled =
  isUsingFirebaseEmulators || import.meta.env.VITE_CATALOG_SOURCE === "firestore";

if (isUsingFirebaseEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

