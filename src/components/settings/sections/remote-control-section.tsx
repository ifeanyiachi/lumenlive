import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { requireFeature } from "@/components/entitlements/require-feature"
import { useTranslation } from "react-i18next"

import { useRemoteControl } from "../hooks/use-remote-control"

function StatusDot({ running }: { running: boolean }) {
  const { t } = useTranslation("settings")
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`size-2 rounded-full ${
          running ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/30"
        }`}
      />
      <span className="text-[0.625rem] text-muted-foreground">
        {running ? t("remote.listening") : t("remote.stopped")}
      </span>
    </div>
  )
}

export function RemoteControlSection() {
  const { t } = useTranslation("settings")
  const {
    oscPort,
    setOscPort,
    httpPort,
    setHttpPort,
    oscStatus,
    httpStatus,
    oscError,
    httpError,
    commandLog,
    clearCommandLog,
    handleOscToggle,
    handleHttpToggle,
  } = useRemoteControl()

  return (
    <div className="flex flex-col gap-6">
      {/* OSC */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("remote.osc")}
        </label>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <label className="text-xs text-muted-foreground">
              {t("remote.port")}
            </label>
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
            onClick={() => {
              if (
                oscStatus.running ||
                requireFeature("remote_control", t("remote.featureName"))
              )
                handleOscToggle()
            }}
            className="text-xs"
          >
            {oscStatus.running ? t("remote.stop") : t("remote.start")}
          </Button>
        </div>
        {oscError && <p className="text-[0.625rem] text-red-500">{oscError}</p>}
        {oscStatus.running && oscStatus.port && (
          <p className="text-[0.625rem] text-muted-foreground">
            {t("remote.oscListening", { port: oscStatus.port })}
          </p>
        )}
        <p className="text-[0.625rem] text-muted-foreground">
          {t("remote.oscDescription")}
        </p>
      </div>

      {/* HTTP API */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("remote.httpApi")}
        </label>
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <label className="text-xs text-muted-foreground">
              {t("remote.port")}
            </label>
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
            onClick={() => {
              if (
                httpStatus.running ||
                requireFeature("remote_control", t("remote.featureName"))
              )
                handleHttpToggle()
            }}
            className="text-xs"
          >
            {httpStatus.running ? t("remote.stop") : t("remote.start")}
          </Button>
        </div>
        {httpError && (
          <p className="text-[0.625rem] text-red-500">{httpError}</p>
        )}
        {httpStatus.running && httpStatus.port && (
          <p className="text-[0.625rem] text-muted-foreground">
            {t("remote.httpServing", { port: httpStatus.port })}
          </p>
        )}
        {httpStatus.running && httpStatus.token && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
            <p className="mb-1 text-[0.625rem] font-medium text-amber-600 dark:text-amber-400">
              {t("remote.accessCode")}
            </p>
            <code className="block font-mono text-xs break-all text-foreground select-all">
              {httpStatus.token}
            </code>
            <p className="mt-1.5 text-[0.5625rem] leading-relaxed text-muted-foreground">
              {t("remote.accessCodeIntro")}{" "}
              <span className="font-mono">
                Authorization: Bearer &lt;code&gt;
              </span>{" "}
              {t("remote.accessCodeMiddle")}{" "}
              <span className="font-mono">X-Auth-Token</span>{" "}
              {t("remote.accessCodeOutro")}
            </p>
          </div>
        )}
        <p className="text-[0.625rem] text-muted-foreground">
          {t("remote.httpDescription")}
        </p>
      </div>

      {/* Firewall guidance */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-1 text-[0.625rem] font-medium text-muted-foreground">
          {t("remote.firewall.title")}
        </p>
        <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
          {t("remote.firewall.description")}
        </p>
      </div>

      {/* Command Log */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("remote.commandLog")}
          </label>
          {commandLog.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[0.5rem]"
              onClick={clearCommandLog}
            >
              {t("remote.clear")}
            </Button>
          )}
        </div>
        <div className="h-32 overflow-y-auto rounded-lg border border-border bg-background p-2">
          {commandLog.length === 0 ? (
            <p className="mt-8 text-center text-[0.625rem] text-muted-foreground">
              {t("remote.noCommands")}
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
