/**
 * Packages the per-translation exports in temp-bible/ into ONE upload-ready,
 * self-contained folder with a matching manifest:
 *
 *   store-upload/bible-translations/manifest.json        — catalog the app fetches
 *   store-upload/bible-translations/<slug>.db.zst        — one compressed DB per translation
 *
 * Upload the `bible-translations/` folder to the R2 bucket root so the files
 * serve at /bible-translations/manifest.json and /bible-translations/<slug>.db.zst
 * — the paths the app's downloader expects (see `MANIFEST_URL` in
 * `src-tauri/src/commands/resource_store.rs`). Everything lives under this one
 * prefix, so future translations just drop into the same folder.
 *
 * Unlike build-store-manifest.ts (which builds only the FREE translations from
 * source JSON), this hosts EVERYTHING present in temp-bible/, including the
 * copyrighted versions — every entry is `bundled-free` distribution so the app
 * downloads and installs it directly. The `copyrighted` flag is still recorded
 * truthfully. (Hosting copyrighted translations for redistribution is a
 * licensing decision made by the operator; this script only packages what's
 * already in temp-bible/.)
 *
 * Run: bun run data/build-store-upload.ts
 * Prereq: bun run data/  (the export that produced temp-bible/) — i.e. temp-bible/
 *         must contain <slug>.db.zst files + index.json.
 */

import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

const DATA_DIR = import.meta.dir
// temp-bible/ lives at the repo root (produced by the per-translation export).
const SRC = join(DATA_DIR, "..", "temp-bible")
// One self-contained folder: manifest.json + <slug>.db.zst side by side. This
// whole folder maps to the /bible-translations/ prefix on R2.
const R2_PREFIX = "bible-translations"
const OUT_DIR = join(DATA_DIR, "store-upload", R2_PREFIX)

const MANIFEST_VERSION = 1
const RESOURCE_SCHEMA_VERSION = 1
const CDN_BASE = "https://pub-82480c48c8b84f8ca5162b8d42bd99d0.r2.dev"

/** License name per abbreviation (publisher for copyrighted, else public domain). */
const LICENSE_NAME: Record<string, string> = {
  KJV: "Public Domain",
  SpaRV: "Public Domain",
  FreJND: "Public Domain",
  PorBLivre: "Public Domain",
  NIV: "Biblica",
  ESV: "Crossway",
  NASB: "Lockman Foundation",
  NKJV: "Thomas Nelson",
  NLT: "Tyndale House",
  AMP: "Lockman Foundation",
  // Ingested from XML (see data/ingest-xml-translations.ts)
  WEB: "Public Domain",
  Bishops: "Public Domain",
  CVB: "Public Domain",
  DBY: "Public Domain",
  RSV: "National Council of Churches",
  NRSV: "National Council of Churches",
  GNB: "American Bible Society",
  HCSB: "Holman Bible Publishers",
  NCV: "Thomas Nelson",
  NLV: "Christian Literature International",
  KJ21: "Deuel Enterprises",
  MKJV: "Sovereign Grace Publishers",
  TMB: "Deuel Enterprises",
  TNIV: "Biblica",
  MSG: "NavPress",
  NIrV: "Biblica",
}

interface IndexEntry {
  slug: string
  abbreviation: string
  title: string
  language: string
  copyrighted: boolean
  books: number
  verses: number
  dbBytes: number
  zstBytes: number
  sha256: string
}

interface ManifestResource {
  kind: "bible"
  id: string
  title: string
  abbreviation: string
  language: string
  license: {
    name: string
    copyrighted: boolean
    distribution: "bundled-free" | "byo-import"
  }
  schemaVersion: number
  url: string
  sha256: string
  bytes: number
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function main() {
  console.log("\n📦 Packaging store upload from temp-bible/...\n")

  const indexPath = join(SRC, "index.json")
  if (!existsSync(indexPath)) {
    console.error(
      `  ❌ ${indexPath} not found. Run the temp-bible export first.`
    )
    process.exit(1)
  }
  const index = JSON.parse(readFileSync(indexPath, "utf-8")) as {
    translations: IndexEntry[]
  }

  rmSync(join(DATA_DIR, "store-upload"), { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const resources: ManifestResource[] = []

  for (const t of index.translations) {
    const srcZst = join(SRC, `${t.slug}.db.zst`)
    if (!existsSync(srcZst)) {
      console.log(`  ⏭ ${t.abbreviation}: ${t.slug}.db.zst missing, skipping`)
      continue
    }

    // Copy the artifact and re-verify its hash + size against the index, so the
    // manifest can never disagree with the bytes we actually publish.
    const bytes = readFileSync(srcZst)
    const sha256 = sha256Hex(bytes)
    if (sha256 !== t.sha256) {
      console.error(`  ❌ ${t.abbreviation}: sha256 mismatch vs index.json`)
      process.exit(1)
    }
    if (bytes.length !== t.zstBytes) {
      console.error(`  ❌ ${t.abbreviation}: size mismatch vs index.json`)
      process.exit(1)
    }
    copyFileSync(srcZst, join(OUT_DIR, `${t.slug}.db.zst`))

    resources.push({
      kind: "bible",
      id: t.slug,
      title: t.title,
      abbreviation: t.abbreviation,
      language: t.language,
      license: {
        name:
          LICENSE_NAME[t.abbreviation] ??
          (t.copyrighted ? "Copyrighted" : "Public Domain"),
        copyrighted: t.copyrighted,
        // Hosted for direct download — the app installs it in one click.
        distribution: "bundled-free",
      },
      schemaVersion: RESOURCE_SCHEMA_VERSION,
      url: `${CDN_BASE}/${R2_PREFIX}/${t.slug}.db.zst`,
      sha256,
      bytes: bytes.length,
    })
    console.log(
      `  ${t.copyrighted ? "🔒" : "  "} ${t.abbreviation.padEnd(10)} ${t.slug}.db.zst  ` +
        `${(bytes.length / 1024 / 1024).toFixed(1)}MB  ${sha256.slice(0, 12)}…`
    )
  }

  // Guard: unique ids, complete download descriptors.
  const seen = new Set<string>()
  for (const r of resources) {
    if (seen.has(r.id)) throw new Error(`duplicate resource id ${r.id}`)
    seen.add(r.id)
    if (!r.url || !r.sha256 || !r.bytes)
      throw new Error(`${r.id} missing download fields`)
  }

  const manifest = {
    version: MANIFEST_VERSION,
    generatedAt:
      process.env.STORE_MANIFEST_TIMESTAMP ?? new Date().toISOString(),
    resources,
  }
  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  )

  const copyrighted = resources.filter((r) => r.license.copyrighted).length
  console.log(
    `\n✅ Wrote manifest.json — ${resources.length} resources ` +
      `(${copyrighted} copyrighted, ${resources.length - copyrighted} free)`
  )
  console.log(`   📁 ${OUT_DIR}`)
  console.log(
    `\n   Upload the '${R2_PREFIX}/' folder to the R2 bucket root so the files serve at`
  )
  console.log(
    `   ${CDN_BASE}/${R2_PREFIX}/manifest.json and ${CDN_BASE}/${R2_PREFIX}/<slug>.db.zst\n`
  )
}

main()
