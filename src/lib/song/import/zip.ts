/**
 * Minimal, dependency-free ZIP reader for extracting text entries — used to open
 * Quelea `.qsp` song packs (a ZIP of song XML). Parses the central directory and
 * local headers by hand and inflates DEFLATE entries with the platform
 * `DecompressionStream` (available in the Tauri webview and Node 18+), so no zip
 * library is needed. Only the two common storage methods are handled: 0 (stored)
 * and 8 (deflate).
 */

export interface UnzippedEntry {
  name: string
  text: string
}

const EOCD_SIG = 0x06054b50
const CDH_SIG = 0x02014b50

/** Scan backwards for the End-Of-Central-Directory record. */
function findEocd(view: DataView, length: number): number {
  const min = Math.max(0, length - 65557) // 22-byte EOCD + up to 65535 comment
  for (let i = length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i
  }
  return -1
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw")
  // Copy into a fresh ArrayBuffer-backed view so Blob accepts it (the typed
  // `subarray` view may be typed over a SharedArrayBuffer).
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Extract entries whose name passes `filter` as decoded UTF-8 text. Returns `[]`
 * for a malformed archive rather than throwing.
 */
export async function unzipTextEntries(
  data: Uint8Array,
  filter: (name: string) => boolean = () => true
): Promise<UnzippedEntry[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const eocd = findEocd(view, data.length)
  if (eocd < 0) return []

  const total = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)

  const decoder = new TextDecoder("utf-8")
  const entries: UnzippedEntry[] = []
  let p = cdOffset

  for (let i = 0; i < total; i++) {
    if (p + 46 > data.length || view.getUint32(p, true) !== CDH_SIG) break
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decoder.decode(data.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen

    if (name.endsWith("/") || !filter(name)) continue

    // Recompute the data start from the local header (its extra field can differ).
    const lhNameLen = view.getUint16(localOffset + 26, true)
    const lhExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen
    const comp = data.subarray(dataStart, dataStart + compSize)

    let raw: Uint8Array
    if (method === 0) raw = comp
    else if (method === 8) raw = await inflateRaw(comp)
    else continue

    entries.push({ name, text: stripBom(decoder.decode(raw)) })
  }

  return entries
}
