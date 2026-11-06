/**
 * License gating for store resources. This is the client-side half of keeping
 * the store legally clean: copyrighted translations are marked `byo-import`, so
 * the app never downloads their text from our CDN — the user must supply a file
 * they're entitled to. Pure predicates over a resource's `license`.
 */

import type { StoreResource } from "@/types/resource-store"

/** True when we host the file and it installs in one click. */
export function isFreelyInstallable(resource: StoreResource): boolean {
  return resource.license.distribution === "bundled-free"
}

/** True when the user must import their own licensed copy (we don't host it). */
export function requiresUserImport(resource: StoreResource): boolean {
  return resource.license.distribution === "byo-import"
}

export interface Installability {
  ok: boolean
  /** Present when `ok` is false — why a one-click install is blocked. */
  reason?: string
}

/**
 * Whether a resource can be installed directly from the store. A `byo-import`
 * entry, or one missing the download fields we need to fetch + verify, is not
 * one-click installable and must go through the import flow instead.
 */
export function canInstall(resource: StoreResource): Installability {
  if (requiresUserImport(resource)) {
    return {
      ok: false,
      reason:
        "This resource is copyrighted and isn't distributed by LumenLive. Import a copy you're licensed to use.",
    }
  }
  if (!resource.url || !resource.sha256 || resource.bytes == null) {
    return {
      ok: false,
      reason: "This resource has no verified download and can't be installed.",
    }
  }
  return { ok: true }
}
