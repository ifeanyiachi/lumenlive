import { describe, it, expect } from "vitest"
import {
  isImported,
  toInstalledResource,
  importedCatalogEntries,
  IMPORT_ID_PREFIX,
} from "./imported"
import type { InstalledTranslationRecord } from "@/types/resource-store"

function record(
  over: Partial<InstalledTranslationRecord> = {}
): InstalledTranslationRecord {
  return {
    globalId: 1000,
    resourceId: "import-nkjv",
    abbreviation: "NKJV",
    title: "New King James Version",
    language: "en",
    license: "Personal copy",
    isCopyrighted: true,
    schemaVersion: 1,
    ...over,
  }
}

describe("isImported", () => {
  it("recognizes the backend import id prefix", () => {
    expect(isImported("import-nkjv")).toBe(true)
    expect(isImported(`${IMPORT_ID_PREFIX}x`)).toBe(true)
    expect(isImported("web")).toBe(false)
    expect(isImported("kjv")).toBe(false)
  })
})

describe("toInstalledResource", () => {
  it("maps a record and flags imports", () => {
    expect(toInstalledResource(record())).toEqual({
      id: "import-nkjv",
      kind: "bible",
      schemaVersion: 1,
      refId: 1000,
      imported: true,
    })
  })

  it("does not flag a download record as imported", () => {
    const r = toInstalledResource(record({ resourceId: "web", globalId: 1002 }))
    expect(r.imported).toBe(false)
    expect(r.refId).toBe(1002)
  })
})

describe("importedCatalogEntries", () => {
  it("synthesizes a removable installed card for each import", () => {
    const entries = importedCatalogEntries([
      record(),
      record({ resourceId: "web", abbreviation: "WEB", globalId: 1003 }), // download, ignored
    ])
    expect(entries).toHaveLength(1)
    const [e] = entries
    expect(e.status).toBe("installed")
    expect(e.resource.kind).toBe("bible")
    expect(e.resource.id).toBe("import-nkjv")
    expect(e.installed?.refId).toBe(1000) // global id → removable via store_remove_bible
    expect(e.installed?.imported).toBe(true)
    expect(e.installed?.bundled).toBeUndefined() // so the Remove button shows
    if (e.resource.kind === "bible") {
      expect(e.resource.abbreviation).toBe("NKJV")
    }
  })

  it("returns nothing when there are no imports", () => {
    expect(importedCatalogEntries([record({ resourceId: "kjv" })])).toEqual([])
  })
})
