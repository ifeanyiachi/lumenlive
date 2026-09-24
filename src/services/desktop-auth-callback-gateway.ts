import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import { handleDesktopAuthCallback } from "./desktop-auth-service"
import {
  clearPendingBrowserAction,
  completeBrowserAuthentication,
  resumePendingBrowserAction,
} from "./desktop-auth-flow"
import { openAccountMenu } from "@/lib/account-menu"

export const DESKTOP_AUTH_CALLBACK_EVENT = "lumenlive://auth-callback"

interface NativeDesktopAuthCallback {
  code: string | null
  state: string
  error: string | null
  errorDescription: string | null
  errorUri: string | null
}

let initialization: Promise<() => void> | null = null

function callbackUrl(payload: NativeDesktopAuthCallback): string {
  const params = new URLSearchParams()
  if (payload.code) params.set("code", payload.code)
  params.set("state", payload.state)
  if (payload.error) params.set("error", payload.error)
  if (payload.errorDescription) {
    params.set("error_description", payload.errorDescription)
  }
  if (payload.errorUri) params.set("error_uri", payload.errorUri)
  return `lumenlive://auth/callback?${params.toString()}`
}

function routeCallback(payload: NativeDesktopAuthCallback): void {
  void (async () => {
    try {
      const result = await handleDesktopAuthCallback(callbackUrl(payload))
      const activation = await completeBrowserAuthentication(result)
      if (activation.kind === "activated") resumePendingBrowserAction()
      // Keep the Account surface visible for activation errors and team choice.
      openAccountMenu()
    } catch {
      clearPendingBrowserAction()
      openAccountMenu()
    }
  })()
}

/**
 * Connect the native callback event before the app starts its normal boot
 * hydration. Native validation has already removed arbitrary query fields;
 * the desktop auth service still validates state and consumes the transaction.
 */
export function initializeDesktopAuthCallbackBridge(): Promise<() => void> {
  if (initialization) return initialization

  initialization = (async () => {
    const unlisten = await listen<NativeDesktopAuthCallback>(
      DESKTOP_AUTH_CALLBACK_EVENT,
      (event) => routeCallback(event.payload)
    )
    const pending = await invoke<NativeDesktopAuthCallback[]>(
      "consume_desktop_auth_callbacks"
    )
    for (const callback of pending) routeCallback(callback)

    const dispose = () => {
      void unlisten()
      if (initialization) initialization = null
    }
    return dispose
  })().catch((error) => {
    initialization = null
    throw error
  })

  return initialization
}
