const PUBLISHED_APP_URL = "https://atlascont.lovable.app";

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function getPublicAppUrl() {
  return normalizeUrl(PUBLISHED_APP_URL);
}

export function buildPublicAppUrl(path = "") {
  const baseUrl = getPublicAppUrl();

  if (!path) {
    return baseUrl;
  }

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}