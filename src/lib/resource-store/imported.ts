/**
 * Surface user-imported translations in the store.
 *
 * Imports live in the same install registry as catalog downloads, but they have
 * no manifest entry — so {@link diffCatalog} (which only walks the manifest)
 * never emits a card for them. This module bridges that gap with pure helpers:
 * detect an import by its backend id prefix, convert a registry record into the
 * {@link InstalledResource} the diff/bundled logic consumes, and synthesize the
 * "installed" {@link CatalogEntry}s the store appends for imports.
 *
 * The synthesized cards are removable exactly like downloads (they carry the
 * translation's global id as `refId`, which `store_remove_bible` deletes).
 */

import type {
  CatalogEntry,
  InstalledResource,
  InstalledTranslationRecord,
} from "@/types/resource-store"

/**
 * Prefix the backend assigns to imported translations' resource ids
 * (`import-<abbrev>`). Kept in step with `sanitize` in
 * `src-tauri/src/commands/bible_import.rs`.
 */
export const IMPORT_ID_PREFIX = "import-"

/** Whether a registry resource id belongs to a user import. */
export function isImported(resourceId: string): boolean {
  return resourceId.startsWith(IMPORT_ID_PREFIX)
}

/**
 * The {@link InstalledResource} form of a registry record, for diffing against
 * the manifest and for bundled-detection. `imported` is set so downstream can
 * tell imports apart from catalog downloads.
 */
export function toInstalledResource(
  record: InstalledTranslationRecord
): InstalledResource {
  return {
    id: record.resourceId,
    kind: "bible",
    schemaVersion: record.schemaVersion,
    refId: record.globalId,
    imported: isImported(record.resourceId),
  }
}

/**
 * Synthesize "installed" catalog entries for the imported translations among
 * `records`. Non-imports are ignored (the manifest diff already covers them).
 * Each entry is a removable installed Bible card built from the record's own
 * metadata.
 */
export function importedCatalogEntries(
  records: InstalledTranslationRecord[]
): CatalogEntry[] {
  return records.filter((r) => isImported(r.resourceId)).map(importedEntry)
}

function importedEntry(record: InstalledTranslationRecord): CatalogEntry {
  return {
    resource: {
      kind: "bible",
      id: record.resourceId,
      title: record.title,
      abbreviation: record.abbreviation,
      language: record.language,
      license: {
        name: record.license,
        copyrighted: record.isCopyrighted,
        // Imports are always the user's own copy, never distributed by us.
        distribution: "byo-import",
      },
      schemaVersion: record.schemaVersion,
    },
    status: "installed",
    installed: {
      id: record.resourceId,
      kind: "bible",
      schemaVersion: record.schemaVersion,
      refId: record.globalId,
      imported: true,
    },
  }
}
