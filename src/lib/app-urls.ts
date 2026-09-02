/**
 * URLs on the LumenLive **app / dashboard** host — the `lumenbo` app that serves
 * both the admin console and the church account portal (and the sign-up / login
 * pages), deployed at `app.lumenlive.xyz`.
 *
 * This host is deliberately distinct from:
 *   - the `/v1` **API** host (`VITE_LUMENBO_URL` → `api.lumenlive.xyz`), and
 *   - the **marketing** site (`lumenlive.xyz`, e.g. donations).
 *
 * Override the host at build time with `VITE_LUMENLIVE_APP_URL`.
 */

const APP_BASE = (
  import.meta.env.VITE_LUMENLIVE_APP_URL ?? "https://app.lumenlive.xyz"
).replace(/\/+$/, "")

/** Build an absolute URL on the app host for `path` (e.g. `/signup`). */
export function appUrl(path: string): string {
  return `${APP_BASE}${path.startsWith("/") ? path : `/${path}`}`
}
