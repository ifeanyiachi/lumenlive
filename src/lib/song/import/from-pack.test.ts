import { describe, it, expect } from "vitest"
import { importSongsFromPack, isPackSongEntry } from "./from-pack"

/**
 * Build a minimal ZIP archive using the STORED (method 0) format — no
 * compression, so no library is needed. Exercises the real `unzipTextEntries`
 * central-directory reader end-to-end. CRC-32 is left 0 because the reader does
 * not verify it.
 */
function makeStoredZip(files: { name: string; text: string }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const data = enc.encode(f.text)

    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(8, 0, true) // method: stored
    lv.setUint32(18, data.length, true) // compressed size
    lv.setUint32(22, data.length, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 0, true) // method: stored
    cv.setUint32(20, data.length, true) // compressed size
    cv.setUint32(24, data.length, true) // uncompressed size
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true) // local header offset
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0)
  const cdOffset = offset
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true) // records on this disk
  ev.setUint16(10, files.length, true) // total records
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdOffset, true)

  const total = offset + cdSize + eocd.length
  const out = new Uint8Array(total)
  let p = 0
  for (const l of locals) {
    out.set(l, p)
    p += l.length
  }
  for (const c of centrals) {
    out.set(c, p)
    p += c.length
  }
  out.set(eocd, p)
  return out
}

describe("isPackSongEntry", () => {
  it("accepts known song extensions regardless of nesting", () => {
    expect(isPackSongEntry("worship-main/songs/oceans.onsong")).toBe(true)
    expect(isPackSongEntry("repo/Amazing Grace.chordpro")).toBe(true)
    expect(isPackSongEntry("a/b/c.xml")).toBe(true)
  })

  it("rejects directories, repo furniture, and non-song files", () => {
    expect(isPackSongEntry("repo/")).toBe(false)
    expect(isPackSongEntry("repo/README.md")).toBe(false)
    expect(isPackSongEntry("repo/LICENSE")).toBe(false)
    expect(isPackSongEntry("repo/LICENSE.txt")).toBe(false)
    expect(isPackSongEntry("repo/cover.png")).toBe(false)
    expect(isPackSongEntry("repo/notes.md")).toBe(false)
  })
})

describe("importSongsFromPack", () => {
  it("imports every song file in the archive, auto-detecting format", async () => {
    const onsong = `Title: Oceans
Artist: Hillsong United
Key: [D]

Verse 1:
You[D] call me out upon the[A] waters`
    const chordpro = `{title: Cornerstone}
{start_of_verse}
My [C]hope is built on nothing [G]less
{end_of_verse}`

    const zip = makeStoredZip([
      { name: "worship-main/", text: "" },
      { name: "worship-main/README.md", text: "# not a song" },
      { name: "worship-main/oceans.onsong", text: onsong },
      { name: "worship-main/songs/cornerstone.chordpro", text: chordpro },
    ])

    const songs = await importSongsFromPack(zip)
    const titles = songs.map((s) => s.title).sort()
    expect(titles).toEqual(["Cornerstone", "Oceans"])

    const oceans = songs.find((s) => s.title === "Oceans")!
    expect(oceans.sourceFormat).toBe("onsong")
    expect(oceans.authors).toEqual(["Hillsong United"])
    expect(oceans.sections[0].lyrics).toContain(
      "You call me out upon the waters"
    )
  })

  it("returns [] for a non-archive blob rather than throwing", async () => {
    const songs = await importSongsFromPack(
      new TextEncoder().encode("not a zip")
    )
    expect(songs).toEqual([])
  })
})
