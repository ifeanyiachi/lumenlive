/**
 * Test-only helper: assemble a valid ZIP archive in memory so the ZIP reader and
 * the Quelea `.qsp` importer can be exercised without a fixture file. Supports
 * both stored (method 0) and deflate (method 8) entries. CRCs are left zero — the
 * reader does not verify them.
 */

export interface ZipInput {
  name: string
  text: string
  deflate?: boolean
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw")
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(cs)
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export async function buildZip(inputs: ZipInput[]): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const input of inputs) {
    const nameBytes = enc.encode(input.name)
    const uncompressed = enc.encode(input.text)
    const method = input.deflate ? 8 : 0
    const compressed = input.deflate
      ? await deflateRaw(uncompressed)
      : uncompressed

    const local = new Uint8Array(30 + nameBytes.length + compressed.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, compressed.length, true)
    lv.setUint32(22, uncompressed.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(compressed, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, compressed.length, true)
    cv.setUint32(24, uncompressed.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const cdBytes = concat(centrals)
  const cdOffset = offset
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, inputs.length, true)
  ev.setUint16(10, inputs.length, true)
  ev.setUint32(12, cdBytes.length, true)
  ev.setUint32(16, cdOffset, true)

  return concat([...locals, cdBytes, eocd])
}
