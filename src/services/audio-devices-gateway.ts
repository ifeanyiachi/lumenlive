import { invoke } from "@tauri-apps/api/core"
import type { DeviceInfo } from "@/types/audio"

/**
 * Gateway for audio-input device enumeration. Isolates the Tauri command name
 * so the Audio settings section expresses intent ("list the input devices")
 * without importing `@tauri-apps/*`.
 */

/** Enumerate the available audio-input devices. */
export function listAudioDevices(): Promise<DeviceInfo[]> {
  return invoke<DeviceInfo[]>("get_audio_devices")
}
