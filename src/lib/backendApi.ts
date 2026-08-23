const configuredBaseUrl = import.meta.env.VITE_BACKEND_API_URL?.replace(/\/$/, "") || "";

/** API may live on Vercel while the SPA is served by Firebase Hosting. */
export const backendApiUrl = (path: string) => `${configuredBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
