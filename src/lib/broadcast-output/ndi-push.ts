/**
 * NDI frame capture for the output window (S2 Phase 3).
 *
 * The decision layer (whether to push at all, and whether to send a keyed vs.
 * opaque frame) already lives in `frame.shouldPushNdiFrame` and
 * `ndi-key.shouldSendTransparentNdi`; this module owns the *capture*: read the
 * right pixels off a canvas and hand the raw RGBA `ArrayBuffer` to a `send`
 * function.
 *
 * Two paths, matching the two decisions:
 *   - **keyed** — render foreground-only onto a fresh transparent scratch canvas
 *     (via the injected `drawForeground`) and ship that, for a see-through feed.
 *   - **opaque** — copy the live program canvas; if its size differs from the NDI
 *     target, scale through the scratch canvas first.
 *
 * `scratch` is a caller-owned holder (a React ref works) for the reused CPU-backed
 * capture canvas, so this module keeps no state. `send` is injected to keep this
 * lib module off the Tauri/services layer; the component passes the NDI gateway.
 * Returns whether a frame was sent, so the caller can stamp its last-push clock.
 */

/** Injected pixel sink — the component wires this to the NDI output gateway. */
export type SendNdiFrame = (
  buffer: ArrayBuffer,
  width: number,
  height: number
) => Promise<unknown>

export interface CaptureNdiFrameInput {
  targetWidth: number
  targetHeight: number
  /** True → capture the keyed foreground; false → copy the opaque program frame. */
  keyed: boolean
  /** Paints the keyed foreground onto a transparent ctx sized to the target. */
  drawForeground: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => void
  /** The live opaque program canvas (used by the non-keyed path). */
  sourceCanvas: HTMLCanvasElement | null
  /** Reused CPU-backed scratch canvas holder (e.g. a React ref). */
  scratch: { current: HTMLCanvasElement | null }
  send: SendNdiFrame
}

/** A CPU-backed 2D context for readback: `willReadFrequently` skips the GPU roundtrip. */
function readbackCtx(
  canvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
  return canvas.getContext("2d", { willReadFrequently: true })
}

/**
 * Capture one NDI frame and send it. Returns `true` if a frame was shipped (the
 * caller should then stamp its last-push timestamp), `false` if it bailed (no
 * context / no source canvas).
 */
export async function captureAndSendNdiFrame(
  input: CaptureNdiFrameInput
): Promise<boolean> {
  const {
    targetWidth,
    targetHeight,
    keyed,
    drawForeground,
    sourceCanvas,
    scratch,
    send,
  } = input

  if (keyed) {
    const ndiCanvas = scratch.current ?? document.createElement("canvas")
    ndiCanvas.width = targetWidth
    ndiCanvas.height = targetHeight
    const ndiCtx = readbackCtx(ndiCanvas)
    if (!ndiCtx) return false
    drawForeground(ndiCtx, targetWidth, targetHeight)
    scratch.current = ndiCanvas
    const imageData = ndiCtx.getImageData(0, 0, targetWidth, targetHeight)
    await send(imageData.data.buffer, targetWidth, targetHeight)
    return true
  }

  const canvas = sourceCanvas
  if (!canvas) return false
  let sourceCtx = canvas.getContext("2d")
  if (!sourceCtx) return false
  let sourceWidth = canvas.width
  let sourceHeight = canvas.height

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    const ndiCanvas = scratch.current ?? document.createElement("canvas")
    ndiCanvas.width = targetWidth
    ndiCanvas.height = targetHeight
    const ndiCtx = readbackCtx(ndiCanvas)
    if (!ndiCtx) return false
    ndiCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
    scratch.current = ndiCanvas
    sourceCtx = ndiCtx
    sourceWidth = targetWidth
    sourceHeight = targetHeight
  }

  // Read raw RGBA pixels and hand the underlying ArrayBuffer straight to Tauri's
  // binary IPC — no base64 (33% inflation) and no JSON of a multi-megabyte payload.
  const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight)
  await send(imageData.data.buffer, sourceWidth, sourceHeight)
  return true
}
