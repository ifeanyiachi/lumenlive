/**
 * Shared wire types for self-contained content bundles — the contract between
 * the Rust `write_bundle` / `read_bundle` commands and the JS build/parse
 * modules. Pure data, no dependencies, so both the services gateway
 * (`@/services/bundle-gateway`) and the per-format `lib/**` builders can share
 * one definition instead of each redeclaring it.
 */

import type { MediaType } from "@/types/media"

/**
 * Metadata for one packaged media file, carried in a bundle manifest. Shared by
 * every bundle format (schedule / theme / backup): `zipName` locates the bytes
 * inside the archive, `srcPath` is the file's original absolute path on the
 * exporting machine, and `asset` carries the media-library record when the
 * reference was a library asset (absent for a file referenced only by a baked
 * `imageUrl`/`videoUrl`).
 */
export interface BundleMediaEntry {
  zipName: string
  srcPath: string
  asset?: {
    id: string
    name: string
    type: MediaType
    width?: number
    height?: number
    duration?: number
    fileSize: number
  }
}

/** One media file to embed in a bundle, as chosen by the exporter. */
export interface BundleMediaFile {
  /** Absolute source path on the exporting machine. */
  srcPath: string
  /** Entry name under `media/` in the archive; echoed back on import. */
  zipName: string
}

/** A media file extracted from a bundle into the managed library on import. */
export interface ExtractedMedia {
  /** The archive entry name under `media/` (matches {@link BundleMediaFile.zipName}). */
  zipName: string
  /** Absolute path of the extracted file in the managed media-library. */
  path: string
}
