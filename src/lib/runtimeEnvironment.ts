/**
 * Returns true only for the local development runtime.
 *
 * Vercel preview/production builds must never expose data-generation and
 * feature-flag tooling, even when a build-time environment variable is
 * missing. Hostname detection is therefore intentionally part of the guard.
 */
export const isDevelopmentRuntime = (): boolean => {
  const configuredEnvironment = String(import.meta.env?.VITE_APP_ENV || "").toLowerCase();

  if (["staging", "prod", "production"].includes(configuredEnvironment)) {
    return false;
  }

  if (typeof window === "undefined") {
    return import.meta.env?.DEV === true || ["dev", "development", "uat"].includes(configuredEnvironment);
  }

  const hostname = window.location.hostname.toLowerCase();
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const isAiStudio = hostname.includes("run.app") || hostname.includes("ais-") || hostname.includes("preview");

  return isLocalHost || isAiStudio || import.meta.env?.DEV === true || configuredEnvironment === "" || configuredEnvironment === "dev" || configuredEnvironment === "development" || configuredEnvironment === "uat";
};
