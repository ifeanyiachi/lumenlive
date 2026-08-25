import { useSettingsStore } from "@/stores"

import { ApiKeyField } from "../ui/api-key-field"
import { useApiKeyField } from "../hooks/use-api-key-field"

export function SpeechSection() {
  const { deepgramApiKey, setDeepgramApiKey } = useSettingsStore()

  const keyField = useApiKeyField(deepgramApiKey, setDeepgramApiKey)

  return (
    <div className="flex flex-col gap-6">
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
    </div>
  )
}
