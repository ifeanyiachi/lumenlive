# Security Policy

This document describes LumenLive's Content Security Policy and how to report
vulnerabilities.

## Content Security Policy

LumenLive sets the webview CSP via `src-tauri/tauri.conf.json`. CSP applies only
to the webview (JavaScript, HTML, and CSS loaded inside the Tauri window); it
does **not** gate network calls made by the Rust process.

```text
default-src 'self';
script-src 'self' https://www.youtube.com https://s.ytimg.com;
style-src 'self' 'unsafe-inline';
img-src 'self' asset: https://asset.localhost data: blob: https://i.ytimg.com https://img.youtube.com;
font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost http://localhost:3000 ws://localhost:3000;
media-src 'self' asset: https://asset.localhost blob:;
worker-src 'self';
frame-src https: http:;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
manifest-src 'self';
```

### Directive rationale

- **`default-src 'self'`** — same-origin fallback for any directive not listed.
- **`script-src 'self' https://www.youtube.com https://s.ytimg.com`** — no inline
  scripts, no `eval`, no CDNs for app code. YouTube's origins are allowed solely
  for the embedded YouTube player used by the Web & YouTube presentation feature.
- **`style-src 'self' 'unsafe-inline'`** — `'unsafe-inline'` is required by
  Tailwind utility generation, React inline `style={}` props, the `<style>` block
  in `broadcast-output.html`, and the dynamic `<style>` element that
  `src/components/theme-provider.tsx` injects during theme switches to suppress
  transitions.
- **`img-src`** — `asset:` / `https://asset.localhost` serve local media files
  through Tauri's asset protocol; `data:` covers theme background images
  (converted to base64 in `src/lib/theme-designer-files.ts`); `blob:` covers
  canvas-derived images in the broadcast output window; the `ytimg`/`youtube`
  hosts cover YouTube thumbnails. Arbitrary external HTTPS images are **not**
  allowed, to avoid an `<img src>`-based exfiltration path.
- **`font-src 'self' data:`** — fonts ship bundled via `@fontsource-variable/*`;
  `data:` permits inline font data.
- **`connect-src 'self' ipc: http://ipc.localhost http://localhost:3000 ws://localhost:3000`**
  — `ipc:` / `ipc.localhost` are Tauri v2's IPC transport (required on Windows);
  the `localhost:3000` origins cover the local remote-control HTTP/WebSocket
  server. All other external traffic (e.g. Deepgram STT, online lyrics search)
  is initiated from Rust and is out of scope for CSP.
- **`media-src 'self' asset: https://asset.localhost blob:`** — local audio/video
  playback via the asset protocol and MediaStream-derived blob URLs.
- **`worker-src 'self'`** — workers may only load from the app origin.
- **`frame-src https: http:`** — the Web & YouTube presentation feature renders
  arbitrary user-supplied URLs in an iframe on the audience output, so http/https
  framing is required. **`frame-ancestors 'none'`** still prevents the app itself
  from being embedded elsewhere.
- **`object-src 'none'`** — no plugins, applets, or `<object>` content.
- **`base-uri 'self'`** — prevents `<base>` tag hijacking.
- **`form-action 'self'`** — forms cannot submit to external origins.
- **`manifest-src 'self'`** — no PWA manifest is used; lock it down.

## Threat model

### What the CSP protects against

- Script injection in the webview (reflected or stored) — no `'unsafe-inline'`
  or `'unsafe-eval'` in `script-src`.
- Data exfiltration to arbitrary origins via `<img>`, `fetch`, or WebSocket from
  the webview — only the specific allow-listed hosts above are reachable.
- Clickjacking of the app itself — `frame-ancestors 'none'`.
- External form-target CSRF and `<base>` tag redirection.

### What the CSP does NOT cover

- Network calls from Rust (Deepgram STT WebSocket, online lyrics providers, any
  `reqwest` calls). Rust-side outbound traffic is bounded separately by
  host allow-lists in the relevant crates — audit those independently.
- Content loaded into the presentation iframe. `frame-src https: http:` is broad
  by design because the operator chooses what URL to present; treat presented web
  pages as untrusted.
- Local IPC via Tauri `invoke()` — same-origin from the webview's perspective.
- Supply-chain risks (a compromised npm or cargo dependency).

## Maintainer notes

- Do **not** add `'unsafe-eval'` or `'unsafe-inline'` to `script-src` to unblock
  a tool. Fix the tool or bundle it locally.
- When adding a feature that talks to a new external API from the webview, add
  only the specific origin to `connect-src`. Avoid scheme-wildcards like `https:`.
- If `invoke()` starts failing with CSP errors after a Tauri upgrade on Windows,
  confirm `ipc: http://ipc.localhost` is still present in `connect-src`.

## Reporting vulnerabilities

Email **hello@lumenlive.xyz**. Please do not open public issues for
security reports. Include reproduction steps and, if possible, a proof of
concept.

## References

- [MDN — Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP — CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Tauri v2 Security](https://v2.tauri.app/security/)
