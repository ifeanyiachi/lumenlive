/**
 * Shared media collector for the theme and backup bundle builders — accumulates
 * the set of local files a bundle must package, de-duplicated by source path,
 * and assigns each a collision-free `media/` entry name. An asset-library record
 * wins over a bare-URL reference to the same file, so a background chosen from
 * the library still carries its metadata even when the same path also appears as
 * a baked URL.
 *
 * (The schedule bundle predates this and keeps its own equivalent collector; its
 * output must stay byte-identical, so it is deliberately left untouched.)
 *
 * Pure data in, pure data out — no `@tauri-apps`, no stores.
 */

import type { MediaAsset } from "@/types/media"
import type { BundleMediaEntry } from "@/types/bundle"

export class BundleMediaCollector {
  private readonly assetById: Map<string, MediaAsset>
  private readonly bySrcPath = new Map<string, BundleMediaEntry>()
  /** Count of asset references whose source file couldn't be located. */
  missing = 0

  constructor(assets: MediaAsset[]) {
    this.assetById = new Map(assets.map((a) => [a.id, a]))
  }

  /** Add the file behind a media-library asset id (counts as missing if unknown). */
  addAssetId(id: string) {
    const asset = this.assetById.get(id)
    if (asset?.filePath) this.add(asset.filePath, asset)
    else this.missing++
  }

  /** Add a bare local file path (no library record). */
  addPath(srcPath: string) {
    this.add(srcPath)
  }

  private add(srcPath: string, asset?: MediaAsset) {
    const existing = this.bySrcPath.get(srcPath)
    if (existing) {
      if (asset && !existing.asset) existing.asset = assetMeta(asset)
      return
    }
    const zipName = `${this.bySrcPath.size}-${sanitizeName(basename(srcPath))}`
    this.bySrcPath.set(srcPath, {
      zipName,
      srcPath,
      asset: asset ? assetMeta(asset) : undefined,
    })
  }

  /** The collected manifest entries, in insertion order. */
  entries(): BundleMediaEntry[] {
    return [...this.bySrcPath.values()]
  }
}

function assetMeta(a: MediaAsset): BundleMediaEntry["asset"] {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    width: a.width,
    height: a.height,
    duration: a.duration,
    fileSize: a.fileSize,
  }
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path
}

/** Keep a filename zip-safe: strip path separators and control/reserved chars. */
function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "")
  return cleaned || "file"
}
