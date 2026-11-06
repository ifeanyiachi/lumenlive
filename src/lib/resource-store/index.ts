/**
 * Barrel for the resource-store business logic. Pure modules only — no React,
 * Zustand, or Tauri. The gateway and store import these as a namespace:
 * `import * as resourceStore from "@/lib/resource-store"`.
 */

export {
  MANIFEST_VERSION,
  SUPPORTED_RESOURCE_SCHEMA,
  ManifestParseError,
  parseManifest,
  type ParseResult,
} from "./manifest"
export {
  isFreelyInstallable,
  requiresUserImport,
  canInstall,
  type Installability,
} from "./license"
export { diffCatalog, bundledInstalledRecords } from "./diff"
export {
  IMPORT_ID_PREFIX,
  isImported,
  toInstalledResource,
  importedCatalogEntries,
} from "./imported"
export {
  bibleDisplayMeta,
  languageLabel,
  formatBytes,
  type BibleDisplayMeta,
} from "./bible-display"
