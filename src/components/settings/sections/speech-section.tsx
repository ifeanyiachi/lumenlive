import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useSettingsStore } from "@/stores"
import {
  formatPauseSeconds,
  PAUSE_SILENCE_MIN_MS,
  PAUSE_SILENCE_MAX_MS,
  PAUSE_SILENCE_STEP_MS,
} from "@/lib/settings/conversions"

import { SectionSlider } from "../ui/section-slider"
import { ApiKeyField } from "../ui/api-key-field"
import { useApiKeyField } from "../hooks/use-api-key-field"

export function SpeechSection() {
  const {
    sttProvider,
    setSttProvider,
    deepgramApiKey,
    setDeepgramApiKey,
    pauseSilenceMs,
    setPauseSilenceMs,
  } = useSettingsStore()

  const keyField = useApiKeyField(deepgramApiKey, setDeepgramApiKey)

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
        <SectionSlider
          label="Pause Sensitivity"
          valueLabel={formatPauseSeconds(pauseSilenceMs)}
          min={PAUSE_SILENCE_MIN_MS}
          max={PAUSE_SILENCE_MAX_MS}
          step={PAUSE_SILENCE_STEP_MS}
          value={pauseSilenceMs}
          onValueChange={(v) => setPauseSilenceMs(v)}
          description="How long a reader can pause before a spoken sentence is cut off. Lower is more responsive but can chop verses at commas and breaths; higher waits through longer pauses — better for slower or more deliberate readers — at the cost of a little end-of-speech delay. Takes effect the next time you start transcription."
        >
          <div className="flex justify-between text-[0.5625rem] tracking-wide text-muted-foreground uppercase">
            <span>Snappy</span>
            <span>Patient</span>
          </div>
        </SectionSlider>
      )}

      {/* Deepgram settings — show when deepgram is selected */}
      {sttProvider === "deepgram" && (
        <ApiKeyField
          label="Deepgram API Key"
          placeholder="Enter your Deepgram API key..."
          configured={!!deepgramApiKey}
          field={keyField}
          instructionsTitle="How to get a Deepgram API key"
          helpText="Required for live transcription. Your key is stored locally on this device and only sent to Deepgram."
        >
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
              <span className="font-medium text-foreground">API Keys</span> and
              click{" "}
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
        </ApiKeyField>
      )}
    </div>
  )
}
