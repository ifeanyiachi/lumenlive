/**
 * Parsing and validation for the store catalog manifest. The manifest is
 * fetched over the network, so it's untrusted input: `parseManifest` rejects a
 * fundamentally malformed document but *skips* individual resource entries it
 * can't understand (unknown kind, unsupported schema, missing fields) rather
 * than failing the whole catalog. That way a newer server manifest stays usable
 * by an older client — it just shows fewer entries.
 */

import type {
  BibleResource,
  LicenseDistribution,
  LicenseInfo,
  Manifest,
  StoreResource,
} from "@/types/resource-store"

/** Manifest format version this client understands. */
export const MANIFEST_VERSION = 1

/** Highest per-resource schemaVersion this client can install. */
export const SUPPORTED_RESOURCE_SCHEMA = 1

const DISTRIBUTIONS: readonly LicenseDistribution[] = [
  "bundled-free",
  "byo-import",
]

export interface ParseResult {
  manifest: Manifest
  /** Human-readable notes for entries that were skipped, for logging. */
  warnings: string[]
}

/** Thrown when the manifest document is malformed beyond recovery. */
export class ManifestParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ManifestParseError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function parseLicense(value: unknown): LicenseInfo | null {
  if (!isRecord(value)) return null
  const { name, copyrighted, distribution, attribution } = value
  if (!isNonEmptyString(name)) return null
  if (typeof copyrighted !== "boolean") return null
  if (!DISTRIBUTIONS.includes(distribution as LicenseDistribution)) return null
  if (attribution !== undefined && typeof attribution !== "string") return null
  return {
    name,
    copyrighted,
    distribution: distribution as LicenseDistribution,
    ...(attribution !== undefined ? { attribution } : {}),
  }
}

/**
 * Validate one Bible resource. Returns the typed resource, or a string reason
 * it was skipped (so the caller can collect a warning).
 */
function parseBibleResource(
  value: Record<string, unknown>
): BibleResource | string {
  const { id, title, abbreviation, language, schemaVersion } = value
  if (!isNonEmptyString(id)) return "bible entry missing id"
  if (!isNonEmptyString(title)) return `bible "${String(id)}" missing title`
  if (!isNonEmptyString(abbreviation))
    return `bible "${id}" missing abbreviation`
  if (!isNonEmptyString(language)) return `bible "${id}" missing language`
  if (typeof schemaVersion !== "number")
    return `bible "${id}" missing schemaVersion`
  if (schemaVersion > SUPPORTED_RESOURCE_SCHEMA)
    return `bible "${id}" schemaVersion ${schemaVersion} is newer than supported ${SUPPORTED_RESOURCE_SCHEMA}`

  const license = parseLicense(value.license)
  if (!license) return `bible "${id}" has invalid license`

  // Download fields are optional (absent for byo-import), but when present must
  // be well-formed — a partial download descriptor is treated as invalid.
  const { url, sha256, bytes } = value
  if (url !== undefined && !isNonEmptyString(url))
    return `bible "${id}" has invalid url`
  if (sha256 !== undefined && !isNonEmptyString(sha256))
    return `bible "${id}" has invalid sha256`
  if (bytes !== undefined && (typeof bytes !== "number" || bytes < 0))
    return `bible "${id}" has invalid bytes`

  return {
    kind: "bible",
    id,
    title,
    abbreviation,
    language,
    license,
    schemaVersion,
    ...(url !== undefined ? { url } : {}),
    ...(sha256 !== undefined ? { sha256 } : {}),
    ...(bytes !== undefined ? { bytes } : {}),
  }
}

/**
 * Parse a resource of any kind. Unknown kinds are skipped (returned as a
 * warning string) rather than failing — forward compatibility with kinds a
 * newer manifest introduces.
 */
function parseResource(value: unknown): StoreResource | string {
  if (!isRecord(value)) return "resource entry is not an object"
  switch (value.kind) {
    case "bible":
      return parseBibleResource(value)
    case "broadcast-theme":
    case "slide-theme":
    case "background":
      return `resource kind "${value.kind}" is not supported by this version`
    default:
      return `unknown resource kind "${String(value.kind)}"`
  }
}

/**
 * Parse and validate a manifest document. Throws {@link ManifestParseError} if
 * the top-level shape is malformed or its version is unsupported. Individual
 * bad resource entries are skipped and reported in `warnings`.
 */
export function parseManifest(json: unknown): ParseResult {
  if (!isRecord(json)) {
    throw new ManifestParseError("manifest is not an object")
  }
  if (typeof json.version !== "number") {
    throw new ManifestParseError("manifest is missing a numeric version")
  }
  if (json.version > MANIFEST_VERSION) {
    throw new ManifestParseError(
      `manifest version ${json.version} is newer than supported ${MANIFEST_VERSION}`
    )
  }
  if (!isNonEmptyString(json.generatedAt)) {
    throw new ManifestParseError("manifest is missing generatedAt")
  }
  if (!Array.isArray(json.resources)) {
    throw new ManifestParseError("manifest.resources is not an array")
  }

  const resources: StoreResource[] = []
  const warnings: string[] = []
  const seen = new Set<string>()
  for (const entry of json.resources) {
    const parsed = parseResource(entry)
    if (typeof parsed === "string") {
      warnings.push(parsed)
      continue
    }
    const key = `${parsed.kind}:${parsed.id}`
    if (seen.has(key)) {
      warnings.push(`duplicate resource "${key}" skipped`)
      continue
    }
    seen.add(key)
    resources.push(parsed)
  }

  return {
    manifest: {
      version: json.version,
      generatedAt: json.generatedAt,
      resources,
    },
    warnings,
  }
}
