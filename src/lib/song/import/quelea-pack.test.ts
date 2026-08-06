import { describe, expect, it } from "vitest"
import { importSongsFromQsp } from "./quelea-pack"
import { buildZip } from "./zip-fixtures"

const song = (title: string) =>
  `<song><title>${title}</title><author>A</author>` +
  `<lyrics><section title="Verse 1"><lyrics>line one</lyrics></section></lyrics></song>`

describe("importSongsFromQsp", () => {
  it("unzips and parses every Quelea song XML in the pack", async () => {
    let n = 0
    const zip = await buildZip([
      { name: "amazing-grace.xml", text: song("Amazing Grace"), deflate: true },
      {
        name: "how-great.xml",
        text: song("How Great Thou Art"),
        deflate: true,
      },
      { name: "cover.png", text: "binary-ish" }, // ignored (not .xml)
    ])
    const songs = await importSongsFromQsp(zip, () => `id-${++n}`, 0)
    expect(songs.map((s) => s.title)).toEqual([
      "Amazing Grace",
      "How Great Thou Art",
    ])
    expect(songs.every((s) => s.sourceFormat === "quelea")).toBe(true)
    expect(songs[0].sections[0]).toMatchObject({
      label: "Verse 1",
      lyrics: "line one",
    })
  })

  it("returns an empty list for a non-zip buffer", async () => {
    expect(await importSongsFromQsp(new TextEncoder().encode("nope"))).toEqual(
      []
    )
  })
})
