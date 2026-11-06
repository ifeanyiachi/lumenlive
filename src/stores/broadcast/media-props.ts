import type { StateCreator } from "zustand"
import {
  broadcastOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import type { BroadcastState } from "./types"

/**
 * The media layer (a persistent background video/image behind live content) and
 * the props overlay list. Both emit only the ACTIVE subset to output windows;
 * toggling activity re-emits so windows mount/unmount immediately.
 */
export type MediaPropsSlice = Pick<
  BroadcastState,
  | "mediaLayer"
  | "props"
  | "setMediaLayer"
  | "toggleMediaLayer"
  | "syncMediaLayer"
  | "addProp"
  | "updateProp"
  | "removeProp"
  | "toggleProp"
  | "syncProps"
>

export const createMediaPropsSlice: StateCreator<
  BroadcastState,
  [],
  [],
  MediaPropsSlice
> = (set, get) => ({
  mediaLayer: null,
  props: [],

  setMediaLayer: (mediaLayer) => {
    set({ mediaLayer })
    get().syncMediaLayer()
  },
  toggleMediaLayer: () => {
    set((s) => ({
      mediaLayer: s.mediaLayer
        ? { ...s.mediaLayer, active: !s.mediaLayer.active }
        : null,
    }))
    get().syncMediaLayer()
  },
  syncMediaLayer: () => {
    const s = get()
    const layer = s.mediaLayer
    broadcastOutputEvent(s.outputs, BROADCAST_EVENTS.mediaLayerUpdate, {
      layer: layer?.active ? layer : null,
    })
  },
  addProp: (prop) => {
    set((s) => ({ props: [...s.props, prop] }))
    get().syncProps()
  },
  updateProp: (id, updates) => {
    set((s) => ({
      props: s.props.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }))
    get().syncProps()
  },
  removeProp: (id) => {
    set((s) => ({ props: s.props.filter((p) => p.id !== id) }))
    get().syncProps()
  },
  toggleProp: (id) => {
    set((s) => ({
      props: s.props.map((p) =>
        p.id === id ? { ...p, active: !p.active } : p
      ),
    }))
    get().syncProps()
  },
  syncProps: () => {
    const s = get()
    const props = s.props.filter((p) => p.active)
    broadcastOutputEvent(s.outputs, BROADCAST_EVENTS.propsUpdate, { props })
  },
})
