export function ytCommand(
  iframe: HTMLIFrameElement | null,
  func: string,
  args: unknown[] = []
): void {
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "*"
  )
}

export function ytMute(iframe: HTMLIFrameElement | null): void {
  ytCommand(iframe, "mute")
}

export function ytUnmute(iframe: HTMLIFrameElement | null): void {
  ytCommand(iframe, "unMute")
}

export function ytPlay(iframe: HTMLIFrameElement | null): void {
  ytCommand(iframe, "playVideo")
}

export function ytPause(iframe: HTMLIFrameElement | null): void {
  ytCommand(iframe, "pauseVideo")
}

export function ytSeek(
  iframe: HTMLIFrameElement | null,
  seconds: number
): void {
  ytCommand(iframe, "seekTo", [seconds, true])
}
