import { useState, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  MicIcon,
  TvIcon,
  KeyIcon,
  SettingsIcon,
  CheckIcon,
  BookOpenIcon,
  PencilIcon,
  RadioIcon,
  HelpCircleIcon,
  GraduationCapIcon,
  BrainCircuitIcon,
  ListOrderedIcon,
  ImageIcon,
  FolderOpenIcon,
  MusicIcon,
} from "lucide-react"
import { useSettingsStore } from "@/stores"
import { flushSettings } from "@/stores/settings-store"
import { BUILTIN_SLIDE_THEMES } from "@/types/slide"
import { useTutorialStore } from "@/stores/tutorial-store"
import { useSettingsDialogStore } from "@/lib/settings-dialog"
import { ManageEdits } from "@/components/verse-edit/manage-edits"
import type { DeviceInfo } from "@/types/audio"
import { listAudioDevices } from "@/services/audio-devices-gateway"
import {
  listTranslations,
  getActiveTranslation,
  setActiveTranslation,
} from "@/services/translation-gateway"
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
  resolveMediaLibraryPath,
  revealMediaLibraryFolder,
} from "@/services/media-library-gateway"
import {
  gainToPercent,
  percentToGain,
  thresholdToPercent,
  percentToThreshold,
  formatPauseSeconds,
  PAUSE_SILENCE_MIN_MS,
  PAUSE_SILENCE_MAX_MS,
  PAUSE_SILENCE_STEP_MS,
} from "@/lib/settings/conversions"
import {
  groupTranslations,
  type TranslationInfo,
} from "@/lib/settings/translations"
import {
  makeCommandLogEntry,
  appendCommandLogEntry,
  stripRemotePrefix,
  parsePort,
  type CommandLogEntry,
} from "@/lib/settings/remote-log"

/* -------------------------------------------------------------------------- */
/*  Nav definition                                                            */
/* -------------------------------------------------------------------------- */

type NavSection =
  | "audio"
  | "speech"
  | "bible"
  | "saved-edits"
  | "display"
  | "schedule"
  | "media"
  | "songs"
  | "remote"
  | "help"

const navItems: { name: string; id: NavSection; icon: React.ReactNode }[] = [
  {
    name: "Audio",
    id: "audio",
    icon: <MicIcon strokeWidth={2} />,
  },
  {
    name: "Speech Recognition",
    id: "speech",
    icon: <BrainCircuitIcon strokeWidth={2} />,
  },
  {
    name: "Bible",
    id: "bible",
    icon: <BookOpenIcon strokeWidth={2} />,
  },
  {
    name: "Saved Edits",
    id: "saved-edits",
    icon: <PencilIcon strokeWidth={2} />,
  },
  {
    name: "Display Mode",
    id: "display",
    icon: <TvIcon strokeWidth={2} />,
  },
  {
    name: "Schedule",
    id: "schedule",
    icon: <ListOrderedIcon strokeWidth={2} />,
  },
  {
    name: "Media Library",
    id: "media",
    icon: <ImageIcon strokeWidth={2} />,
  },
  {
    name: "Songs",
    id: "songs",
    icon: <MusicIcon strokeWidth={2} />,
  },
  {
    name: "Remote Control",
    id: "remote",
    icon: <RadioIcon strokeWidth={2} />,
  },
  {
    name: "Help",
    id: "help",
    icon: <HelpCircleIcon strokeWidth={2} />,
  },
]

/* -------------------------------------------------------------------------- */
/*  Section: Audio                                                            */
/* -------------------------------------------------------------------------- */

function AudioSection() {
  const { audioDeviceId, setAudioDeviceId, gain, setGain } = useSettingsStore()

  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch devices on mount. All state updates happen after the await (never
  // synchronously in the effect body), and are guarded against a late resolve
  // after unmount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listAudioDevices()
        if (!cancelled) setDevices(result)
      } catch {
        // Tauri command may not be available during dev
        if (!cancelled) setDevices([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // gain is 0.0-2.0 in store, display as 0-100%
  const gainPercent = gainToPercent(gain)

  return (
    <div className="flex flex-col gap-6">
      {/* Device selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Input Device
        </label>
        <Select
          value={audioDeviceId ?? "__default__"}
          onValueChange={(v) =>
            setAudioDeviceId(v === "__default__" ? null : v)
          }
          disabled={loading}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={loading ? "Loading devices..." : "System default"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">System default</SelectItem>
            {devices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name}
                {device.is_default ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[0.625rem] text-muted-foreground">
          Selected device persists across sessions. Leave as system default to
          follow OS audio routing.
        </p>
      </div>

      {/* Input gain */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Input Gain
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {gainPercent}%
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[gainPercent]}
          onValueChange={([v]) => setGain(percentToGain(v))}
        />
        <p className="text-[0.625rem] text-muted-foreground">
          Amplifies the incoming audio signal before transcription. 50% is unity
          gain.
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section: Speech Recognition                                               */
/* -------------------------------------------------------------------------- */

function SpeechSection() {
  const {
    sttProvider,
    setSttProvider,
    deepgramApiKey,
    setDeepgramApiKey,
    pauseSilenceMs,
    setPauseSilenceMs,
  } = useSettingsStore()

  const [keyValue, setKeyValue] = useState(deepgramApiKey ?? "")
  const [saved, setSaved] = useState(false)

  const handleSaveKey = () => {
    setDeepgramApiKey(keyValue || null)
    flushSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Provider selector */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Provider
        </label>

        <RadioGroup
          value={sttProvider}
          onValueChange={(v) => setSttProvider(v as "deepgram" | "sherpa")}
          className="gap-3"
        >
          {/* Deepgram (cloud) */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${
              sttProvider !== "deepgram"
                ? "hover:border-muted-foreground/25"
                : ""
            }`}
          >
            <RadioGroupItem value="deepgram" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                Cloud (Deepgram)
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Uses Deepgram Nova-3 for real-time streaming transcription.
                Requires an API key and internet connection. Best accuracy with
                keyword boosting for Bible terms.
              </p>
            </div>
          </label>

          {/* Sherpa / Moonshine (local, fast) */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${
              sttProvider !== "sherpa" ? "hover:border-muted-foreground/25" : ""
            }`}
          >
            <RadioGroupItem value="sherpa" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                Local (Fast) — recommended offline
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Runs Moonshine locally via sherpa-onnx. Fully offline, no API
                key, and fast even on modest hardware — the best offline option
                for low-end machines.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* Pause sensitivity — only affects the local (Moonshine) endpointer.
          Deepgram does its own server-side endpointing. */}
      {sttProvider === "sherpa" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Pause Sensitivity
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatPauseSeconds(pauseSilenceMs)}
            </span>
          </div>
          <Slider
            min={PAUSE_SILENCE_MIN_MS}
            max={PAUSE_SILENCE_MAX_MS}
            step={PAUSE_SILENCE_STEP_MS}
            value={[pauseSilenceMs]}
            onValueChange={([v]) => setPauseSilenceMs(v)}
          />
          <div className="flex justify-between text-[0.5625rem] tracking-wide text-muted-foreground uppercase">
            <span>Snappy</span>
            <span>Patient</span>
          </div>
          <p className="text-[0.625rem] text-muted-foreground">
            How long a reader can pause before a spoken sentence is cut off.
            Lower is more responsive but can chop verses at commas and breaths;
            higher waits through longer pauses — better for slower or more
            deliberate readers — at the cost of a little end-of-speech delay.
            Takes effect the next time you start transcription.
          </p>
        </div>
      )}

      {/* Deepgram settings — show when deepgram is selected */}
      {sttProvider === "deepgram" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Deepgram API Key
            </label>
            {deepgramApiKey && (
              <Badge variant="outline" className="text-[0.5rem]">
                Key configured
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Enter your Deepgram API key..."
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              className="flex-1 text-xs"
            />
            <Button size="sm" onClick={handleSaveKey}>
              {saved ? (
                <>
                  <CheckIcon className="size-3" />
                  Saved
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-2.5">
            <p className="mb-1 text-[0.625rem] font-medium text-foreground">
              How to get a Deepgram API key
            </p>
            <ol className="ml-3.5 list-decimal space-y-0.5 text-[0.625rem] leading-relaxed text-muted-foreground">
              <li>
                Sign up for a free account at{" "}
                <span className="font-mono text-foreground">
                  console.deepgram.com/signup
                </span>{" "}
                — it includes free credits, no card required.
              </li>
              <li>
                In the console, open{" "}
                <span className="font-medium text-foreground">API Keys</span>{" "}
                and click{" "}
                <span className="font-medium text-foreground">
                  Create a New API Key
                </span>
                .
              </li>
              <li>
                Copy the key (shown only once) and paste it above, then press{" "}
                <span className="font-medium text-foreground">Save</span>.
              </li>
            </ol>
          </div>
          <p className="text-[0.625rem] text-muted-foreground">
            Required for live transcription. Your key is stored locally on this
            device and only sent to Deepgram.
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section: Display Mode                                                     */
/* -------------------------------------------------------------------------- */

function DisplayModeSection() {
  const {
    confidenceThreshold,
    setConfidenceThreshold,
    cooldownMs,
    setCooldownMs,
    directAutoDisplay,
    setDirectAutoDisplay,
    semanticAutoQueue,
    setSemanticAutoQueue,
  } = useSettingsStore()

  const thresholdPercent = thresholdToPercent(confidenceThreshold)

  return (
    <div className="flex flex-col gap-6">
      {/* Detection behavior toggles */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Detection Behavior
        </label>

        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                Direct verse auto-display
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                When a verse reference like "John 3:16" is spoken, automatically
                display it on screen. When off, it only appears in the queue.
              </p>
            </div>
            <Switch
              checked={directAutoDisplay}
              onCheckedChange={setDirectAutoDisplay}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                Semantic verse auto-queue
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                When a verse is detected from spoken content (e.g. "And God so
                loved the world"), automatically add it to the queue. When off,
                semantic detections only appear in the AI Detections panel.
              </p>
            </div>
            <Switch
              checked={semanticAutoQueue}
              onCheckedChange={setSemanticAutoQueue}
            />
          </div>
        </div>
      </div>

      {/* Confidence threshold */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Confidence Threshold
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {thresholdPercent}%
          </span>
        </div>
        <Slider
          min={35}
          max={100}
          step={1}
          value={[thresholdPercent]}
          onValueChange={([v]) => setConfidenceThreshold(percentToThreshold(v))}
        />
        <p className="text-[0.625rem] text-muted-foreground">
          Minimum confidence required for auto-display and auto-queue. Applies
          to both direct and semantic detections. Higher values reduce false
          positives.
        </p>
      </div>

      {/* Cooldown */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Cooldown
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {cooldownMs}ms
          </span>
        </div>
        <Slider
          min={500}
          max={10000}
          step={250}
          value={[cooldownMs]}
          onValueChange={([v]) => setCooldownMs(v)}
        />
        <p className="text-[0.625rem] text-muted-foreground">
          Minimum time between auto-displayed detections. Prevents rapid
          flickering when multiple verses are detected in quick succession.
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section titles                                                            */
/* -------------------------------------------------------------------------- */

const sectionTitles: Record<NavSection, string> = {
  audio: "Audio",
  speech: "Speech Recognition",
  bible: "Bible Translation",
  "saved-edits": "Saved Verse Edits",
  display: "Display Mode",
  schedule: "Schedule",
  media: "Media Library",
  songs: "Songs",
  remote: "Remote Control",
  help: "Help",
}

/* -------------------------------------------------------------------------- */
/*  Section: Bible Translation                                                */
/* -------------------------------------------------------------------------- */

function BibleSection() {
  const [translations, setTranslations] = useState<TranslationInfo[]>([])
  const [activeId, setActiveId] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const lexiconEnabled = useSettingsStore((s) => s.lexiconEnabled)
  const setLexiconEnabled = useSettingsStore((s) => s.setLexiconEnabled)

  useEffect(() => {
    async function load() {
      try {
        const [trans, active] = await Promise.all([
          listTranslations(),
          getActiveTranslation(),
        ])
        setTranslations(trans)
        setActiveId(active)
      } catch (e) {
        console.error("Failed to load translations:", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleChange = async (value: string) => {
    const id = parseInt(value)
    try {
      await setActiveTranslation(id)
      setActiveId(id)
      // Update frontend stores so all panels use the new translation
      const { useBibleStore } = await import("@/stores")
      useBibleStore.getState().setActiveTranslation(id)
    } catch (e) {
      console.error("Failed to set translation:", e)
    }
  }

  const { english: englishTranslations, other: otherTranslations } =
    groupTranslations(translations)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Primary Translation
        </label>
        <Select
          value={String(activeId)}
          onValueChange={handleChange}
          disabled={loading}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={loading ? "Loading..." : "Select translation"}
            />
          </SelectTrigger>
          <SelectContent>
            {englishTranslations.length > 0 && (
              <>
                <div className="px-2 py-1 text-[0.5625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  English
                </div>
                {englishTranslations.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.abbreviation} — {t.title}
                  </SelectItem>
                ))}
              </>
            )}
            {otherTranslations.length > 0 && (
              <>
                <div className="mt-1 px-2 py-1 text-[0.5625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  Other Languages
                </div>
                {otherTranslations.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.abbreviation} — {t.title}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
        <p className="text-[0.625rem] text-muted-foreground">
          Detected verses will display in this translation.
          {translations.length > 0 &&
            ` ${translations.length} translations available.`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Original Languages
        </label>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground">
              Greek &amp; Hebrew lexicon
            </span>
            <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
              Bundled with KJV but off by default. When on, each verse gains an
              interlinear (He / Gr) toggle for word-by-word original text with
              Strong&apos;s definitions, and lets you push a word study to the
              program preview. When off, it stays hidden everywhere.
            </p>
          </div>
          <Switch
            checked={lexiconEnabled}
            onCheckedChange={setLexiconEnabled}
          />
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section: Remote Control                                                   */
/* -------------------------------------------------------------------------- */

function RemoteControlSection() {
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

  return (
    <div className="flex flex-col gap-6">
      {/* OSC */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          OSC (Open Sound Control)
        </label>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <label className="text-xs text-muted-foreground">Port</label>
            <Input
              type="number"
              value={oscPort}
              onChange={(e) => setOscPort(e.target.value)}
              className="h-7 w-24 text-xs"
              disabled={oscStatus.running}
            />
          </div>
          <StatusDot running={oscStatus.running} />
          <Button
            size="sm"
            variant={oscStatus.running ? "destructive" : "default"}
            onClick={handleOscToggle}
            className="text-xs"
          >
            {oscStatus.running ? "Stop" : "Start"}
          </Button>
        </div>
        {oscError && <p className="text-[0.625rem] text-red-500">{oscError}</p>}
        {oscStatus.running && oscStatus.port && (
          <p className="text-[0.625rem] text-muted-foreground">
            Listening on UDP port {oscStatus.port}
          </p>
        )}
        <p className="text-[0.625rem] text-muted-foreground">
          Receives commands from hardware controllers (Stream Deck, TouchOSC,
          Companion) via OSC over UDP. OSC has no access code (the protocol has
          no auth) — only enable it on networks you trust.
        </p>
      </div>

      {/* HTTP API */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          HTTP API
        </label>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <label className="text-xs text-muted-foreground">Port</label>
            <Input
              type="number"
              value={httpPort}
              onChange={(e) => setHttpPort(e.target.value)}
              className="h-7 w-24 text-xs"
              disabled={httpStatus.running}
            />
          </div>
          <StatusDot running={httpStatus.running} />
          <Button
            size="sm"
            variant={httpStatus.running ? "destructive" : "default"}
            onClick={handleHttpToggle}
            className="text-xs"
          >
            {httpStatus.running ? "Stop" : "Start"}
          </Button>
        </div>
        {httpError && (
          <p className="text-[0.625rem] text-red-500">{httpError}</p>
        )}
        {httpStatus.running && httpStatus.port && (
          <p className="text-[0.625rem] text-muted-foreground">
            Serving on http://localhost:{httpStatus.port}/api/v1/
          </p>
        )}
        {httpStatus.running && httpStatus.token && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
            <p className="mb-1 text-[0.625rem] font-medium text-amber-600 dark:text-amber-400">
              Access code (required)
            </p>
            <code className="block font-mono text-xs break-all text-foreground select-all">
              {httpStatus.token}
            </code>
            <p className="mt-1.5 text-[0.5625rem] leading-relaxed text-muted-foreground">
              Enter this on your remote device — send it as an{" "}
              <span className="font-mono">
                Authorization: Bearer &lt;code&gt;
              </span>{" "}
              or <span className="font-mono">X-Auth-Token</span> header. Without
              it, control requests are rejected. The code changes each time you
              restart the server.
            </p>
          </div>
        )}
        <p className="text-[0.625rem] text-muted-foreground">
          REST API for status queries and control commands. Use with custom
          dashboards, automation scripts, or HTTP-capable controllers. Requests
          are protected by the access code above.
        </p>
      </div>

      {/* Firewall guidance */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-1 text-[0.625rem] font-medium text-muted-foreground">
          Firewall Note
        </p>
        <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
          Your OS may block incoming connections. On macOS, allow LumenLive
          through System Settings → Network → Firewall. On Windows, allow
          through Windows Security → Firewall → Allow an app.
        </p>
      </div>

      {/* Command Log */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Command Log
          </label>
          {commandLog.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[0.5rem]"
              onClick={() => setCommandLog([])}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="h-32 overflow-y-auto rounded-lg border border-border bg-background p-2">
          {commandLog.length === 0 ? (
            <p className="mt-8 text-center text-[0.625rem] text-muted-foreground">
              No commands received yet
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {commandLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 text-[0.625rem]"
                >
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {entry.timestamp}
                  </span>
                  <Badge variant="outline" className="h-3.5 px-1 text-[0.5rem]">
                    {entry.source}
                  </Badge>
                  <span className="font-mono text-foreground">
                    {entry.command}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section: Help                                                             */
/* -------------------------------------------------------------------------- */

function HelpSection() {
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Resources to help you get the most out of LumenLive.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCapIcon className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Interactive Tutorial</p>
              <p className="text-xs text-muted-foreground">
                Step-by-step walkthrough of every feature
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              closeSettings()
              setTimeout(() => {
                useTutorialStore.getState().startTutorial()
              }, 300)
            }}
          >
            <GraduationCapIcon className="mr-1.5 size-3.5" />
            Restart
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyIcon className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Keyboard Shortcuts</p>
              <p className="text-xs text-muted-foreground">
                Arrow keys navigate the tutorial, Esc to dismiss
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusDot({ running }: { running: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`size-2 rounded-full ${
          running ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/30"
        }`}
      />
      <span className="text-[0.625rem] text-muted-foreground">
        {running ? "Listening" : "Stopped"}
      </span>
    </div>
  )
}

function SavedEditsSection() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Manage saved verse formatting edits. These are applied when presenting
        verses from the schedule.
      </p>
      <ManageEdits />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section: Schedule                                                         */
/* -------------------------------------------------------------------------- */

function ScheduleSection() {
  const preventDuplicateScheduleItems = useSettingsStore(
    (s) => s.preventDuplicateScheduleItems
  )
  const setPreventDuplicateScheduleItems = useSettingsStore(
    (s) => s.setPreventDuplicateScheduleItems
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Building the Schedule
        </label>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground">
              Prevent duplicate items
            </span>
            <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
              When something already in the schedule is added again — the same
              verse, slide deck, media file, or video — keep the original and
              flash it in the list instead of adding a second copy. Section
              headers are never affected, so repeated dividers still work.
            </p>
          </div>
          <Switch
            checked={preventDuplicateScheduleItems}
            onCheckedChange={setPreventDuplicateScheduleItems}
          />
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Which setting fits your service?
          </span>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Leave it on</span> if
            your schedule is built ahead of time by several people, or if verses
            land in it from AI detection and search during the service. Two
            operators dragging John 3:16 in from different panels then get one
            item, and the flash shows where it already is.
          </p>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Turn it off</span> if
            your order of service deliberately repeats content — a
            call-to-worship verse read again at the benediction, a bumper video
            before and after the sermon, or a song slide reprised at the end.
            With it off, every add creates its own item you can re-order and
            re-cue independently.
          </p>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section: Media Library                                                    */
/* -------------------------------------------------------------------------- */

function MediaLibrarySection() {
  const mediaImportMode = useSettingsStore((s) => s.mediaImportMode)
  const setMediaImportMode = useSettingsStore((s) => s.setMediaImportMode)

  const [libraryPath, setLibraryPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const dir = await resolveMediaLibraryPath()
      if (!cancelled && dir) setLibraryPath(dir)
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenFolder = async () => {
    if (!libraryPath) return
    await revealMediaLibraryFolder(libraryPath)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Import storage mode */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          When Importing Media
        </label>

        <RadioGroup
          value={mediaImportMode}
          onValueChange={(v) => setMediaImportMode(v as "reference" | "copy")}
          className="gap-3"
        >
          {/* Reference (default) */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${
              mediaImportMode !== "reference"
                ? "hover:border-muted-foreground/25"
                : ""
            }`}
          >
            <RadioGroupItem value="reference" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                Reference originals
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Keeps only a link to each file where it already lives. Uses no
                extra disk space, but a clip stops working if you move, rename,
                or delete the original — and the library can't move to another
                computer on its own.
              </p>
            </div>
          </label>

          {/* Copy into library */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${
              mediaImportMode !== "copy"
                ? "hover:border-muted-foreground/25"
                : ""
            }`}
          >
            <RadioGroupItem value="copy" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                Copy into app library
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Copies each imported file into a folder LumenLive manages, so
                the library keeps working even if you move or delete the
                originals. Uses more disk space. Removing a copied item from the
                library deletes its copy.
              </p>
            </div>
          </label>
        </RadioGroup>

        <p className="text-[0.625rem] text-muted-foreground">
          This applies to files imported from now on. Media already in your
          library is left exactly as it is.
        </p>
      </div>

      {/* Library folder */}
      {libraryPath && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Library Folder
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[0.625rem] text-muted-foreground">
              {libraryPath}
            </code>
            <Button variant="outline" size="sm" onClick={handleOpenFolder}>
              <FolderOpenIcon className="mr-1.5 size-3.5" />
              Open
            </Button>
          </div>
          <p className="text-[0.625rem] text-muted-foreground">
            Where copied files are stored. Only used when "Copy into app
            library" is selected.
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section: Songs                                                            */
/* -------------------------------------------------------------------------- */

const SONG_THEME_OPTIONS = BUILTIN_SLIDE_THEMES.filter(
  (t) => t.category === "song"
)

function SongsSection() {
  const defaults = useSettingsStore((s) => s.songSlideDefaults)
  const setDefaults = useSettingsStore((s) => s.setSongSlideDefaults)
  const geniusApiKey = useSettingsStore((s) => s.geniusApiKey)
  const setGeniusApiKey = useSettingsStore((s) => s.setGeniusApiKey)
  const update = (patch: Partial<typeof defaults>) =>
    setDefaults({ ...defaults, ...patch })

  const [geniusKeyValue, setGeniusKeyValue] = useState(geniusApiKey ?? "")
  const [geniusSaved, setGeniusSaved] = useState(false)

  const handleSaveGeniusKey = () => {
    setGeniusApiKey(geniusKeyValue.trim() || null)
    flushSettings()
    setGeniusSaved(true)
    setTimeout(() => setGeniusSaved(false), 2000)
  }

  const toggles: {
    key: keyof typeof defaults
    label: string
    description: string
  }[] = [
    {
      key: "breakOnBlankLines",
      label: "Break on blank lines",
      description:
        "Start a new slide at stanza breaks, even under the line cap.",
    },
    {
      key: "includeTitleSlide",
      label: "Title slide",
      description: "Prepend a slide with the song title and author.",
    },
    {
      key: "includeBlankEndSlide",
      label: "Blank end slide",
      description: "Append a blank slide so the last click clears the screen.",
    },
    {
      key: "showSectionLabels",
      label: "Show section labels",
      description: 'Overlay a small "Verse 1" / "Chorus" badge on each slide.',
    },
    {
      key: "transparentBackground",
      label: "Transparent background",
      description:
        "Replace the theme background with transparency, for keying lyrics over live video.",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Genius API key — powers lyric-line search in "Search Online Lyrics" */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Genius API Key
          </label>
          {geniusApiKey && (
            <Badge variant="outline" className="text-[0.5rem]">
              Key configured
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="Enter your Genius API key..."
            value={geniusKeyValue}
            onChange={(e) => setGeniusKeyValue(e.target.value)}
            className="flex-1 text-xs"
          />
          <Button size="sm" onClick={handleSaveGeniusKey}>
            {geniusSaved ? (
              <>
                <CheckIcon className="size-3" />
                Saved
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-2.5">
          <p className="mb-1 text-[0.625rem] font-medium text-foreground">
            How to get a Genius API key
          </p>
          <ol className="ml-3.5 list-decimal space-y-0.5 text-[0.625rem] leading-relaxed text-muted-foreground">
            <li>
              Sign in at{" "}
              <span className="font-mono text-foreground">
                genius.com/api-clients
              </span>{" "}
              (a free Genius account).
            </li>
            <li>
              Click{" "}
              <span className="font-medium text-foreground">
                New API Client
              </span>
              , fill in any app name and URL, then create it.
            </li>
            <li>
              On the client, click{" "}
              <span className="font-medium text-foreground">
                Generate Access Token
              </span>
              , copy the token, paste it above, and press{" "}
              <span className="font-medium text-foreground">Save</span>.
            </li>
          </ol>
        </div>
        <p className="text-[0.625rem] text-muted-foreground">
          Enables Genius results (including lyric-line matches) in the online
          lyrics search. Stored locally on this device. Other sources work
          without a key.
        </p>
      </div>

      <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
        Defaults used when a song is turned into slides. Any song can override
        these in its editor; changing them here only affects songs that haven't
        been customised.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Default Lyric Theme
        </label>
        <Select
          value={defaults.themeId}
          onValueChange={(v) => update({ themeId: v })}
        >
          <SelectTrigger className="w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SONG_THEME_OPTIONS.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Lines Per Slide
        </label>
        <Input
          type="number"
          min={1}
          max={12}
          value={defaults.maxLinesPerSlide}
          onChange={(e) => {
            const n = Math.max(
              1,
              Math.min(12, Math.round(Number(e.target.value) || 1))
            )
            update({ maxLinesPerSlide: n })
          }}
          className="w-24 text-sm"
        />
      </div>

      <div className="flex flex-col gap-3">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                {t.label}
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                {t.description}
              </p>
            </div>
            <Switch
              checked={defaults[t.key] as boolean}
              onCheckedChange={(v) => update({ [t.key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const sectionComponents: Record<NavSection, React.FC> = {
  audio: AudioSection,
  speech: SpeechSection,
  bible: BibleSection,
  "saved-edits": SavedEditsSection,
  display: DisplayModeSection,
  schedule: ScheduleSection,
  media: MediaLibrarySection,
  songs: SongsSection,
  remote: RemoteControlSection,
  help: HelpSection,
}

/*  Main dialog                                                               */
/* -------------------------------------------------------------------------- */

export function SettingsDialog() {
  const open = useSettingsDialogStore((s) => s.isOpen)
  const activeSection = useSettingsDialogStore((s) => s.activeSection)
  const setActiveSection = useSettingsDialogStore((s) => s.setActiveSection)
  const openSettingsFn = useSettingsDialogStore((s) => s.openSettings)
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings)

  const ActiveContent = sectionComponents[activeSection]

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          openSettingsFn()
        } else {
          closeSettings()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          data-tour="settings"
        >
          <SettingsIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[800px] lg:max-w-[900px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure audio, display mode, and API keys.
        </DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <div className="flex h-14 items-center border-r border-b border-border px-4">
              Settings
            </div>
            <SidebarContent className="border-r border-border">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={item.id === activeSection}
                          onClick={() => setActiveSection(item.id)}
                        >
                          {item.icon}
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[580px] flex-1 flex-col overflow-hidden">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border">
              <div className="flex items-center gap-2 px-4">
                {sectionTitles[activeSection]}
              </div>
            </header>
            <div className="flex flex-1 flex-col overflow-y-auto p-4">
              <ActiveContent />
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
