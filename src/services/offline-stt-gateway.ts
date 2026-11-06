import { invoke } from "@tauri-apps/api/core"

export interface OfflineSttModelStatus {
  id: string
  title: string
  version: string
  installed: boolean
  bytes: number
}

export interface OfflineSttInstallProgress {
  resourceId: string
  received: number
  total: number
}

export type OfflineSttModel = "nemotron"

export const OFFLINE_STT_MODEL_IDS: Record<OfflineSttModel, string> = {
  nemotron: "nemotron-speech-streaming-en-0.6b-560ms-int8",
}

export function getOfflineSttStatus(
  _model: OfflineSttModel
): Promise<OfflineSttModelStatus> {
  return invoke<OfflineSttModelStatus>("offline_stt_model_status")
}

export function installOfflineSttModel(
  _model: OfflineSttModel
): Promise<OfflineSttModelStatus> {
  return invoke<OfflineSttModelStatus>("offline_stt_install_model")
}

export function removeOfflineSttModel(_model: OfflineSttModel): Promise<void> {
  return invoke("offline_stt_remove_model")
}

export async function onOfflineSttInstallProgress(
  handler: (progress: OfflineSttInstallProgress) => void,
  resourceId?: string
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event")
  return listen<OfflineSttInstallProgress>("store:progress", (event) => {
    if (
      Object.values(OFFLINE_STT_MODEL_IDS).includes(event.payload.resourceId) &&
      (!resourceId || event.payload.resourceId === resourceId)
    ) {
      handler(event.payload)
    }
  })
}
