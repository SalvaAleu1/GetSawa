export const CLOUDSAWA_PUBLIC_URL = "https://cloudsawa.com";

export function isCloudSawaPublicProduction(): boolean {
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/$/, "").toLowerCase();
  return process.env.APP_ENV === "production" && appUrl === CLOUDSAWA_PUBLIC_URL;
}

export function getCloudSawaPublicUrl(): string | null {
  return isCloudSawaPublicProduction() ? CLOUDSAWA_PUBLIC_URL : null;
}
