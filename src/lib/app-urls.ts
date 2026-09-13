/**
 * URLs on the LumenLive **app / dashboard** host — the `lumenbo` app that serves
 * both the admin console and the church account portal (and the sign-up / login
 * pages), deployed at `app.lumenlive.xyz`.
 *
 * Kept as its own build-time config (`VITE_LUMENLIVE_APP_URL`), separate from:
 *   - the `/v1` **API** base (`VITE_LUMENBO_URL`), and
 *   - the **marketing** site (`lumenlive.xyz`, e.g. donations).
 *
 * As currently deployed the `/v1` API is served by this same host
 * (`app.lumenlive.xyz`) — `api.lumenlive.xyz` is not deployed — but the two vars
 * stay independent so the hosts can diverge again without a code change.
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
