import { useState, type FormEvent } from "react"
import { BugIcon, LightbulbIcon, MailCheckIcon, SendIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LicensingError } from "@/services/lumenbo-client"
import { sendFeedback, type FeedbackKind } from "@/services/feedback-gateway"
import { startBrowserSignIn } from "@/services/desktop-auth-flow"
import { useAuthStore } from "@/stores/auth-store"
import { useEntitlementsStore } from "@/stores/entitlements-store"
import { useTeamStore } from "@/stores/team-store"

type SendStatus = "idle" | "sending" | "sent" | "failed"

interface FeedbackDraft {
  title: string
  description: string
  steps: string
  expected: string
  impact: string
}

const EMPTY_DRAFT: FeedbackDraft = {
  title: "",
  description: "",
  steps: "",
  expected: "",
  impact: "",
}

export function FeedbackSection() {
  const { t } = useTranslation("settings")
  const status = useAuthStore((state) => state.status)
  const token = useAuthStore((state) => state.token)
  const machineId = useEntitlementsStore((state) => state.machineId)
  const ensureMachineId = useEntitlementsStore((state) => state.ensureMachineId)
  const organizationId = useTeamStore((state) => state.selectedOrganizationId)
  const [kind, setKind] = useState<FeedbackKind>("bug")
  const [draft, setDraft] = useState<FeedbackDraft>(EMPTY_DRAFT)
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function updateDraft(field: keyof FeedbackDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setSendStatus("idle")
    setErrorMessage(null)
  }

  function changeKind(nextKind: string) {
    if (nextKind !== "bug" && nextKind !== "feature") return
    setKind(nextKind)
    setDraft(EMPTY_DRAFT)
    setSendStatus("idle")
    setErrorMessage(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || status !== "authenticated" || sendStatus === "sending") return

    setSendStatus("sending")
    setErrorMessage(null)
    try {
      const id = machineId ?? (await ensureMachineId())
      await sendFeedback(token, {
        kind,
        title: draft.title,
        description: draft.description,
        ...(kind === "bug"
          ? { steps: draft.steps, expected: draft.expected }
          : { impact: draft.impact }),
        machineId: id,
        organizationId,
      })
      setSendStatus("sent")
      setDraft(EMPTY_DRAFT)
    } catch (error) {
      setSendStatus("failed")
      setErrorMessage(
        error instanceof LicensingError
          ? error.message
          : t("feedback.failedDescription")
      )
    }
  }

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">{t("feedback.loading")}</p>
    )
  }

  if (status !== "authenticated") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("feedback.signIn.title")}</p>
          <p className="text-sm text-muted-foreground">
            {t("feedback.signIn.description")}
          </p>
        </div>
        <Button
          type="button"
          className="w-fit"
          onClick={() => void startBrowserSignIn().catch(() => {})}
        >
          {t("feedback.signIn.action")}
        </Button>
      </div>
    )
  }

  const isBug = kind === "bug"

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {t("feedback.description")}
      </p>

      <Tabs value={kind} onValueChange={changeKind}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="bug">
            <BugIcon />
            {t("feedback.tabs.bug")}
          </TabsTrigger>
          <TabsTrigger value="feature">
            <LightbulbIcon />
            {t("feedback.tabs.feature")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <form className="flex flex-col gap-5" onSubmit={submit}>
        <p className="text-xs text-muted-foreground">
          {isBug
            ? t("feedback.bug.description")
            : t("feedback.feature.description")}
        </p>

        <div className="space-y-1.5">
          <label htmlFor="feedback-title" className="text-xs font-medium">
            {t("feedback.form.titleLabel")}
          </label>
          <Input
            id="feedback-title"
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            placeholder={
              isBug
                ? t("feedback.form.bugTitlePlaceholder")
                : t("feedback.form.featureTitlePlaceholder")
            }
            required
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="feedback-description" className="text-xs font-medium">
            {isBug
              ? t("feedback.form.whatHappenedLabel")
              : t("feedback.form.requestLabel")}
          </label>
          <Textarea
            id="feedback-description"
            value={draft.description}
            onChange={(event) => updateDraft("description", event.target.value)}
            placeholder={
              isBug
                ? t("feedback.form.whatHappenedPlaceholder")
                : t("feedback.form.requestPlaceholder")
            }
            className="min-h-24 resize-y"
            required
          />
        </div>

        {isBug ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="feedback-steps" className="text-xs font-medium">
                {t("feedback.form.stepsLabel")}
              </label>
              <Textarea
                id="feedback-steps"
                value={draft.steps}
                onChange={(event) => updateDraft("steps", event.target.value)}
                placeholder={t("feedback.form.stepsPlaceholder")}
                className="min-h-20 resize-y"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="feedback-expected"
                className="text-xs font-medium"
              >
                {t("feedback.form.expectedLabel")}
              </label>
              <Textarea
                id="feedback-expected"
                value={draft.expected}
                onChange={(event) =>
                  updateDraft("expected", event.target.value)
                }
                placeholder={t("feedback.form.expectedPlaceholder")}
                className="min-h-20 resize-y"
                required
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="feedback-impact" className="text-xs font-medium">
              {t("feedback.form.impactLabel")}
            </label>
            <Textarea
              id="feedback-impact"
              value={draft.impact}
              onChange={(event) => updateDraft("impact", event.target.value)}
              placeholder={t("feedback.form.impactPlaceholder")}
              className="min-h-20 resize-y"
            />
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-border/60 pt-4">
          <Button
            type="submit"
            size="sm"
            className="shrink-0"
            disabled={sendStatus === "sending"}
          >
            {sendStatus === "sent" ? (
              <MailCheckIcon className="mr-1.5 size-3.5" />
            ) : (
              <SendIcon className="mr-1.5 size-3.5" />
            )}
            {sendStatus === "sending"
              ? t("feedback.sending")
              : sendStatus === "sent"
                ? t("feedback.sent")
                : t("feedback.send")}
          </Button>

          {sendStatus === "sent" && (
            <p
              className="min-w-0 text-xs text-emerald-600 dark:text-emerald-400"
              role="status"
            >
              {t("feedback.sentDescription")}
            </p>
          )}
          {sendStatus === "failed" && (
            <p className="min-w-0 text-xs text-destructive" role="alert">
              {errorMessage ?? t("feedback.failedDescription")}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
