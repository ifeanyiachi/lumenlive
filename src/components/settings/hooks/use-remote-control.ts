import { useEffect, useRef, useState } from "react"

import {
  getOscStatus,
  getHttpStatus,
  startOsc,
  stopOsc,
  startHttp,
  stopHttp,
  onRemoteCommand,
  type RemoteStatus,
} from "@/services/remote-control-gateway"
import {
  makeCommandLogEntry,
  appendCommandLogEntry,
  stripRemotePrefix,
  parsePort,
  type CommandLogEntry,
} from "@/lib/settings/remote-log"

/**
 * Owns all Remote Control section state: OSC/HTTP port inputs, live server
 * statuses (polled every 2s), start/stop toggles with error capture, and the
 * received-command log fed by the gateway's command listener.
 *
 * The command listener returns a disposer that is always cleaned up on unmount,
 * including when the subscription resolves after the effect has already torn
 * down (the `cancelled` guard).
 */
export function useRemoteControl() {
  const [oscPort, setOscPort] = useState("8000")
  const [httpPort, setHttpPort] = useState("8080")
  const [oscStatus, setOscStatus] = useState<RemoteStatus>({
    running: false,
    port: null,
  })
  const [httpStatus, setHttpStatus] = useState<RemoteStatus>({
    running: false,
    port: null,
  })
  const [oscError, setOscError] = useState<string | null>(null)
  const [httpError, setHttpError] = useState<string | null>(null)
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([])
  const logIdRef = useRef(0)

  // Poll statuses
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const osc = await getOscStatus()
        setOscStatus(osc)
        if (osc.running) setOscError(null)
      } catch {
        /* ignore */
      }
      try {
        const http = await getHttpStatus()
        setHttpStatus(http)
        if (http.running) setHttpError(null)
      } catch {
        /* ignore */
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // Listen for remote commands to populate the log
  useEffect(() => {
    let cancelled = false
    let dispose: (() => void) | undefined

    onRemoteCommand((event) => {
      if (cancelled) return
      const entry = makeCommandLogEntry({
        id: logIdRef.current++,
        timestamp: new Date().toLocaleTimeString(),
        source: "OSC", // We can't distinguish source at event level; default to OSC
        command: stripRemotePrefix(event),
      })
      setCommandLog((prev) => appendCommandLogEntry(prev, entry))
    }).then((fn) => {
      if (cancelled) fn()
      else dispose = fn
    })

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  const handleOscToggle = async () => {
    try {
      if (oscStatus.running) {
        await stopOsc()
        setOscError(null)
      } else {
        const port = parsePort(oscPort, 8000)
        const boundPort = await startOsc(port)
        setOscPort(String(boundPort))
        setOscError(null)
      }
    } catch (e) {
      setOscError(String(e))
    }
  }

  const handleHttpToggle = async () => {
    try {
      if (httpStatus.running) {
        await stopHttp()
        setHttpError(null)
      } else {
        const port = parsePort(httpPort, 8080)
        const info = await startHttp(port)
        setHttpPort(String(info.port))
        setHttpStatus({ running: true, port: info.port, token: info.token })
        setHttpError(null)
      }
    } catch (e) {
      setHttpError(String(e))
    }
  }

  const clearCommandLog = () => setCommandLog([])

  return {
    oscPort,
    setOscPort,
    httpPort,
    setHttpPort,
    oscStatus,
    httpStatus,
    oscError,
    httpError,
    commandLog,
    clearCommandLog,
    handleOscToggle,
    handleHttpToggle,
  }
}
