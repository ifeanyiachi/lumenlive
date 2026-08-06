/**
 * Types for the in-app resource store: the catalog manifest served from the
 * CDN and the installed-resource records used to reconcile it against local
 * state. Pure shapes — no I/O. The gateway fetches, `lib/resource-store`
 * validates and diffs, and the store orchestrates.
 *
 * The manifest is our own JSON (not a Rust/serde boundary), so fields are
 * idiomatic camelCase rather than the snake_case used by `types/bible.ts`.
 */

/** The kinds of resource the store can catalog. Only "bible" is built today. */
export type ResourceKind =
  "bible" | "broadcast-theme" | "slide-theme" | "background"

/**
 * How a resource may be obtained, which the client enforces:
 * - `bundled-free`: public-domain / permissively licensed — we host the file
 *   and it installs in one click.
 * - `byo-import`: copyrighted (e.g. NIV, ESV, NLT). We do NOT host the text;
 *   the catalog entry is a placeholder that opens a "import a file you're
 *   licensed to use" flow, so LumenLive is never the distributor.
 */
export type LicenseDistribution = "bundled-free" | "byo-import"

export interface LicenseInfo {
  /** Human-readable license name, e.g. "Public Domain", "CC-BY-4.0". */
  name: string
  /** True for translations under active commercial copyright. */
  copyrighted: boolean
  distribution: LicenseDistribution
  /** Required attribution text, when the license demands it. */
  attribution?: string
}

/** Fields common to every catalog resource, regardless of kind. */
export interface ResourceBase {
  kind: ResourceKind
  /** Stable slug identifying the resource across manifest versions. */
  id: string
  title: string
  license: LicenseInfo
  /**
   * Version of this resource's on-disk/data schema. A client skips entries
   * whose schemaVersion it doesn't support, so a newer manifest stays
   * backward-compatible with an older app.
   */
  schemaVersion: number
  /** Compressed download size in bytes. Absent for `byo-import` entries. */
  bytes?: number
  /** SHA-256 of the download, hex-encoded. Absent for `byo-import` entries. */
  sha256?: string
  /** CDN URL of the download. Absent for `byo-import` entries. */
  url?: string
}

/** A Bible translation available to install. */
export interface BibleResource extends ResourceBase {
  kind: "bible"
  abbreviation: string
  /** Language code or display name, e.g. "en", "fr", "Twi". */
  language: string
}

/**
 * Discriminated union of catalog resources. Grows as new kinds ship
 * (broadcast-theme / slide-theme / background); today only Bibles exist.
 */
export type StoreResource = BibleResource

export interface Manifest {
  /** Manifest format version (distinct from per-resource schemaVersion). */
  version: number
  /** ISO timestamp the manifest was generated. */
  generatedAt: string
  resources: StoreResource[]
}

/**
 * A locally-installed resource, as reported by the backend registry. Enough to
 * reconcile the catalog against what's already on disk. For Bibles, `refId` is
 * the global translation id used by the Bible query layer.
 */
export interface InstalledResource {
  id: string
  kind: ResourceKind
  schemaVersion: number
  /** Backend-assigned reference (e.g. Bible global translation id). */
  refId?: number
  /**
   * True when this resource ships inside the app bundle rather than being a
   * download (e.g. the bundled KJV). Bundled resources show as installed but
   * cannot be removed — they're the offline baseline the app falls back to.
   */
  bundled?: boolean
  /**
   * True when this record is a user-imported translation (brought in from a
   * file) rather than a catalog download. Imports have no manifest entry, so
   * the store synthesizes their card; they're removable like downloads.
   */
  imported?: boolean
}

/**
 * A full per-translation record from the install registry — covers both catalog
 * downloads and user imports. Carries the display fields (abbreviation, title,
 * language) that the minimal {@link InstalledResource} omits, so the store can
 * build a card for an installed translation that has no manifest counterpart
 * (an import).
 */
export interface InstalledTranslationRecord {
  globalId: number
  resourceId: string
  abbreviation: string
  title: string
  language: string
  license: string
  isCopyrighted: boolean
  schemaVersion: number
}

/** Where a catalog entry stands relative to what's installed. */
export type CatalogStatus =
  "installed" | "available" | "update-available" | "byo-import"

/** A catalog resource paired with its status against local install state. */
export interface CatalogEntry {
  resource: StoreResource
  status: CatalogStatus
  installed?: InstalledResource
}
