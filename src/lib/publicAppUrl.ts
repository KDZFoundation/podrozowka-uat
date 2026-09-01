const DEFAULT_PUBLIC_APP_URL = "https://podrozowka.pl";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const publicAppUrl = trimTrailingSlash(
  import.meta.env.VITE_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL,
);

export const publicPageUrl = (path = "/") => new URL(path, `${publicAppUrl}/`).toString();
