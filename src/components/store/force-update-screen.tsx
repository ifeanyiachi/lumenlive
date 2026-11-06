import { Download, Loader2, RefreshCw, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useUpdateStore } from "@/stores/update-store"

/**
 * Full-window gate shown when a cached or freshly fetched policy makes the
 * running build unsupported. It deliberately has no close or dismiss action:
 * the only way back to the application is to install a supported build.
 */
export function ForceUpdateScreen() {
  const { t } = useTranslation("store")
  const status = useUpdateStore((s) => s.status)
  const available = useUpdateStore((s) => s.available)
  const currentVersion = useUpdateStore((s) => s.currentVersion)
  const minimumSupportedVersion = useUpdateStore(
    (s) => s.minimumSupportedVersion
  )

  const busy = status === "downloading" || status === "installing"
  const failed = status === "error"

  function retry() {
    void Promise.all([
      useUpdateStore.getState().check(),
      useUpdateStore.getState().checkPolicy(),
    ])
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-2xl"
        aria-live="polite"
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
          {failed ? (
            <TriangleAlert className="size-6" aria-hidden="true" />
          ) : (
            <Download className="size-6" aria-hidden="true" />
          )}
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            {t("update.requiredLabel")}
          </p>
          <h1 className="font-heading text-2xl font-medium tracking-tight text-foreground">
            {t("update.requiredTitle")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("update.requiredDescription")}
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
            <dt className="text-xs text-muted-foreground">
              {t("update.currentVersionLabel")}
            </dt>
            <dd className="mt-1 font-mono text-foreground">
              {currentVersion ?? t("common.unknown")}
            </dd>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
            <dt className="text-xs text-muted-foreground">
              {t("update.requiredVersionLabel")}
            </dt>
            <dd className="mt-1 font-mono text-foreground">
              {minimumSupportedVersion ?? t("common.unknown")}
            </dd>
          </div>
        </dl>

        {available && (
          <p className="mt-5 text-sm text-muted-foreground">
            {t("update.available", { version: available.version })}
          </p>
        )}

        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          {available ? (
            <Button
              className="flex-1"
              onClick={() => void useUpdateStore.getState().install()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {busy
                ? status === "installing"
                  ? t("common.installing")
                  : t("common.downloading")
                : t("update.updateNow")}
            </Button>
          ) : null}
          <Button
            className="flex-1"
            variant={available ? "outline" : "default"}
            onClick={retry}
            disabled={busy}
          >
            <RefreshCw aria-hidden="true" />
            {t("update.retry")}
          </Button>
        </div>

        {failed && (
          <p className="mt-4 text-xs text-destructive">
            {t("update.requiredInstallFailed")}
          </p>
        )}
      </section>
    </main>
  )
}
