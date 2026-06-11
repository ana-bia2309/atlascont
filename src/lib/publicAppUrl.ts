const PUBLISHED_APP_URL = "https://atlascontrol.systems";

export function buildPublicAppUrl(path: string): string {
  return `${PUBLISHED_APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export default PUBLISHED_APP_URL;