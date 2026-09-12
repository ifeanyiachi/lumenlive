import { useSettingsStore } from "@/stores"
import { useAuthStore } from "@/stores/auth-store"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

import { ApiKeyField } from "../ui/api-key-field"
import { useApiKeyField } from "../hooks/use-api-key-field"

export function SpeechSection() {
  const { deepgramApiKey, setDeepgramApiKey } = useSettingsStore()
  const transcriptionKeySource = useSettingsStore(
    (s) => s.transcriptionKeySource
  )
  const setTranscriptionKeySource = useSettingsStore(
    (s) => s.setTranscriptionKeySource
  )
  // The choice only matters when signed in — anonymous sessions always use the
  // local key, so we don't offer it and just show the key field.
  const signedIn = useAuthStore((s) => s.status === "authenticated")

  const keyField = useApiKeyField(deepgramApiKey, setDeepgramApiKey)

  const showKeyField = !signedIn || transcriptionKeySource === "local"

  return (
    <div className="flex flex-col gap-6">
      {signedIn && (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Transcription key
          </label>
          <RadioGroup
            value={transcriptionKeySource}
            onValueChange={(v) =>
              setTranscriptionKeySource(v as "platform" | "local")
            }
          >
            <label className="flex cursor-pointer items-start gap-2.5">
              <RadioGroupItem value="platform" className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-foreground">
                  Managed by my LumenLive account
                </span>
                <span className="text-[0.625rem] text-muted-foreground">
                  Transcription is handled for you — nothing to set up.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <RadioGroupItem value="local" className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-foreground">
                  Use my own Deepgram key
                </span>
                <span className="text-[0.625rem] text-muted-foreground">
                  Runs on the key set on this device instead of your account.
                </span>
              </span>
            </label>
          </RadioGroup>
        </div>
      )}

      {showKeyField && (
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
