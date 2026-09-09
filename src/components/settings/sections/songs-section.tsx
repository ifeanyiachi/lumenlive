import { useSettingsStore } from "@/stores"

import { ApiKeyField } from "../ui/api-key-field"
import { useApiKeyField } from "../hooks/use-api-key-field"

export function SongsSection() {
  const geniusApiKey = useSettingsStore((s) => s.geniusApiKey)
  const setGeniusApiKey = useSettingsStore((s) => s.setGeniusApiKey)

  const geniusKeyField = useApiKeyField(geniusApiKey, setGeniusApiKey)

  return (
    <div className="flex flex-col gap-6">
      {/* Genius API key — powers lyric-line search in "Search Online Lyrics" */}
      <ApiKeyField
        label="Genius API Key"
        placeholder="Enter your Genius API key..."
        configured={!!geniusApiKey}
        field={geniusKeyField}
        instructionsTitle="How to get a Genius API key"
        helpText="Enables Genius results (including lyric-line matches) in the online lyrics search. Stored locally on this device. Other sources work without a key."
      >
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
            <span className="font-medium text-foreground">New API Client</span>,
            fill in any app name and URL, then create it.
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
      </ApiKeyField>

      <p className="border-t border-border/60 pt-4 text-[0.625rem] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Disclaimer:</span> By
        enabling this integration, you agree that you are using your own
        personal, non-commercial Genius developer key. This software is a
        neutral utility and is not affiliated with, endorsed, or licensed by
        Genius. You are entirely responsible for complying with the Genius API
        Terms of Service, and any commercial exploitation or misuse of their
        data is strictly at your own risk.
      </p>
    </div>
  )
}
