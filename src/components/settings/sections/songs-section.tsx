import { useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"

import { ApiKeyField } from "../ui/api-key-field"
import { useApiKeyField } from "../hooks/use-api-key-field"

export function SongsSection() {
  const { t } = useTranslation("settings")
  const geniusApiKey = useSettingsStore((s) => s.geniusApiKey)
  const setGeniusApiKey = useSettingsStore((s) => s.setGeniusApiKey)

  const geniusKeyField = useApiKeyField(geniusApiKey, setGeniusApiKey)

  return (
    <div className="flex flex-col gap-6">
      {/* Genius API key — powers lyric-line search in "Search Online Lyrics" */}
      <ApiKeyField
        label={t("songs.apiKeyLabel")}
        placeholder={t("songs.apiKeyPlaceholder")}
        configured={!!geniusApiKey}
        field={geniusKeyField}
        instructionsTitle={t("songs.instructionsTitle")}
        helpText={t("songs.helpText")}
      >
        <ol className="ml-3.5 list-decimal space-y-0.5 text-[0.625rem] leading-relaxed text-muted-foreground">
          <li>
            {t("songs.instructions.signInAt")}{" "}
            <span className="font-mono text-foreground">
              genius.com/api-clients
            </span>{" "}
            {t("songs.instructions.freeAccount")}
          </li>
          <li>
            {t("songs.instructions.click")}{" "}
            <span className="font-medium text-foreground">
              {t("songs.instructions.newApiClient")}
            </span>
            {t("songs.instructions.createClient")}
          </li>
          <li>
            {t("songs.instructions.onClient")}{" "}
            <span className="font-medium text-foreground">
              {t("songs.instructions.generateToken")}
            </span>
            {t("songs.instructions.copyToken")}{" "}
            <span className="font-medium text-foreground">
              {t("common:save")}
            </span>
            {t("songs.instructions.finish")}
          </li>
        </ol>
      </ApiKeyField>

      <p className="border-t border-border/60 pt-4 text-[0.625rem] leading-relaxed text-muted-foreground">
        {t("songs.disclaimer")}
      </p>
    </div>
  )
}
