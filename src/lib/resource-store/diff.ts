/**
 * Reconcile a catalog manifest against locally-installed resources to produce
 * the list the store UI renders. Pure: given the manifest and what's installed,
 * tag each entry `installed` / `available` / `update-available` / `byo-import`.
 *
 * "update-available" is decided by schemaVersion: an installed resource whose
 * schemaVersion is lower than the catalog's has a newer version to fetch.
 */

import type {
  CatalogEntry,
  InstalledResource,
  Manifest,
  StoreResource,
} from "@/types/resource-store"
import { requiresUserImport } from "./license"

/** Stable identity for matching a catalog resource to an installed record. */
function resourceKey(r: { kind: string; id: string }): string {
  return `${r.kind}:${r.id}`
}

/**
 * Given the abbreviations of Bible translations that ship inside the app bundle
 * (i.e. present but not downloaded — e.g. KJV), produce installed records that
 * mark the matching catalog entries as bundled. Bundled entries show as
 * installed but are non-removable. Matching is by abbreviation,
 * case-insensitive. Feed these into {@link diffCatalog} alongside the download
 * registry so bundled translations don't appear as "available" (which would let
 * a user download a redundant copy).
 */
export function bundledInstalledRecords(
  manifest: Manifest,
  bundledAbbreviations: Iterable<string>
): InstalledResource[] {
  const abbrevs = new Set<string>()
  for (const a of bundledAbbreviations) abbrevs.add(a.toUpperCase())

  const records: InstalledResource[] = []
  for (const r of manifest.resources) {
    if (r.kind === "bible" && abbrevs.has(r.abbreviation.toUpperCase())) {
      records.push({
        id: r.id,
        kind: "bible",
        schemaVersion: r.schemaVersion,
        bundled: true,
      })
    }
  }
  return records
}

function statusFor(
  resource: StoreResource,
  installed: InstalledResource | undefined
): CatalogEntry["status"] {
  if (installed) {
    return resource.schemaVersion > installed.schemaVersion
      ? "update-available"
      : "installed"
  }
  // Not installed: copyrighted entries can't be fetched from us; everything
  // else is a normal one-click download.
  return requiresUserImport(resource) ? "byo-import" : "available"
}

/**
 * Build catalog entries from the manifest and the installed registry.
 * Order follows the manifest. Installed resources with no matching catalog
 * entry are not surfaced here (the catalog is the source of truth for what's
 * shown); callers that need orphans should compare separately.
 */
export function diffCatalog(
  manifest: Manifest,
  installed: InstalledResource[]
): CatalogEntry[] {
  const byKey = new Map<string, InstalledResource>()
  for (const record of installed) {
    byKey.set(resourceKey(record), record)
  }

  return manifest.resources.map((resource) => {
    const match = byKey.get(resourceKey(resource))
    return {
      resource,
      status: statusFor(resource, match),
      ...(match ? { installed: match } : {}),
    }
  })
}
