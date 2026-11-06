import { describe, expect, it } from "vitest"
import { unzipTextEntries } from "./zip"
import { buildZip } from "./zip-fixtures"

describe("unzipTextEntries", () => {
  it("reads stored (uncompressed) entries", async () => {
    const zip = await buildZip([{ name: "a.xml", text: "<song>A</song>" }])
    const entries = await unzipTextEntries(zip)
    expect(entries).toEqual([{ name: "a.xml", text: "<song>A</song>" }])
  })

  it("inflates DEFLATE entries", async () => {
    const text = "<song>" + "lyrics ".repeat(50) + "</song>"
    const zip = await buildZip([{ name: "b.xml", text, deflate: true }])
    const entries = await unzipTextEntries(zip)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe(text)
  })

  it("filters entries by name and skips directories", async () => {
    const zip = await buildZip([
      { name: "songs/one.xml", text: "one" },
      { name: "readme.txt", text: "ignore me" },
    ])
    const entries = await unzipTextEntries(zip, (n) => n.endsWith(".xml"))
    expect(entries.map((e) => e.name)).toEqual(["songs/one.xml"])
  })

  it("returns an empty list for a non-zip buffer", async () => {
    expect(
      await unzipTextEntries(new TextEncoder().encode("not a zip"))
    ).toEqual([])
  })
})
