// Local UI types shared between the overlay shell and its child layers.

export type DragMode =
  "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se" | null

/** On-screen bounds of the workspace, in CSS pixels. */
export interface WsRect {
  left: number
  top: number
  width: number
  height: number
}

/** Corner resize-handle size, in CSS pixels. */
export const HANDLE_SIZE = 8
