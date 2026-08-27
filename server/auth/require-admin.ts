import crypto from "node:crypto";
import { json } from "../../api/_lib/http.js";

type FirebaseTokenClaims = {
  aud?: unknown;
  email?: unknown;
  exp?: unknown;
  iss?: unknown;
  role?: unknown;
  admin?: unknown;
};

type GoogleCertificateMap = Record<string, string>;

const CERTIFICATES_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const certificateCache: { certificates: GoogleCertificateMap; expiresAt: number } = { certificates: {}, expiresAt: 0 };

const firebaseProjectId = () => process.env.FIREBASE_AUTH_PROJECT_ID || process.env.GCP_PROJECT_ID || "podrozowka";

const adminEmails = () => new Set(
  (process.env.FIREBASE_ADMIN_EMAILS || "fundacja@d-arka.org,dariusz.pgry@gmail.com,fundacja@konopiedlaziemi.org")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const decodeBase64UrlJson = (value: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const certificates = async () => {
  if (certificateCache.expiresAt > Date.now()) return certificateCache.certificates;

  const response = await fetch(CERTIFICATES_URL);
  const body = await response.json().catch(() => null) as GoogleCertificateMap | null;
  if (!response.ok || !body || typeof body !== "object") throw new Error("firebase_certificate_fetch_failed");

  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
  certificateCache.certificates = body;
  certificateCache.expiresAt = Date.now() + maxAge * 1000;
  return body;
};

const isAdmin = (claims: FirebaseTokenClaims) => {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  return claims.admin === true || claims.role === "admin" || adminEmails().has(email);
};

const verifyFirebaseIdToken = async (idToken: string): Promise<FirebaseTokenClaims | null> => {
  const [encodedHeader, encodedClaims, encodedSignature, ...rest] = idToken.split(".");
  if (!encodedHeader || !encodedClaims || !encodedSignature || rest.length > 0) return null;

  const header = decodeBase64UrlJson(encodedHeader);
  const claims = decodeBase64UrlJson(encodedClaims) as FirebaseTokenClaims | null;
  const projectId = firebaseProjectId();
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string" || !claims) return null;
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;

  const certificate = (await certificates())[header.kid];
  if (!certificate) return null;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedClaims}`);
  verifier.end();
  return verifier.verify(certificate, Buffer.from(encodedSignature, "base64url")) ? claims : null;
};

/**
 * Stops privileged courier operations before they can call the ShipX API.
 * Firebase ID tokens are verified against Google's signing certificates;
 * authorization follows the same admin claims/email allow-list as Firestore.
 */
export const requireAdmin = async (request: Request): Promise<Response | null> => {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "admin_authentication_required" }, 401);

  try {
    const claims = await verifyFirebaseIdToken(match[1]);
    if (!claims) return json({ error: "invalid_admin_token" }, 401);
    if (!isAdmin(claims)) return json({ error: "admin_access_required" }, 403);
    return null;
  } catch {
    return json({ error: "admin_token_verification_failed" }, 503);
  }
};
