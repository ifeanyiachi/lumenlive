import { Dashboard } from "@/components/layout/dashboard"
import { useRemoteControl } from "@/hooks/use-remote-control"
import { useStageSources } from "@/hooks/use-stage-sources"
import { useOutputDisplayGuard } from "@/hooks/use-output-display-guard"
import { useAwaitingDisplayResume } from "@/hooks/use-awaiting-display-resume"
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts"
import { useBlockReload } from "@/hooks/use-block-reload"
import { KeyboardShortcutsOverlay } from "@/components/keyboard/keyboard-shortcuts-overlay"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"
import { AlertOverlay } from "@/components/alerts/alert-overlay"
import { CountdownOverlay } from "@/components/countdown/countdown-overlay"
import { DragGhost } from "@/components/panels/drag-ghost"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { UpdateNotificationDialog } from "@/components/store/update-notification-dialog"
import { ForceUpdateScreen } from "@/components/store/force-update-screen"
import { useUpdateStore } from "@/stores/update-store"
import { Toaster } from "sonner"

export function App() {
  const updateBlocked = useUpdateStore((s) => s.policyStatus === "blocked")

  if (updateBlocked) {
    return (
      <>
        <ForceUpdateScreen />
        <Toaster position="bottom-right" />
      </>
    )
  }

  return <ActiveApp />
}

function ActiveApp() {
  useRemoteControl()
  useStageSources()
  useOutputDisplayGuard()
  useAwaitingDisplayResume()
  useGlobalShortcuts()
  useBlockReload()
  return (
    <>
      {/* Isolate each region so a render error in one can't unmount the
          others — the live output overlays must survive a control-panel crash. */}
      <ErrorBoundary label="control panel">
        <Dashboard />
      </ErrorBoundary>
      <ErrorBoundary label="alert overlay" fallback={() => null}>
        <AlertOverlay />
      </ErrorBoundary>
      <ErrorBoundary label="countdown overlay" fallback={() => null}>
        <CountdownOverlay />
      </ErrorBoundary>
      <ErrorBoundary label="tutorial" fallback={() => null}>
        <TutorialOverlay />
      </ErrorBoundary>
      <ErrorBoundary label="keyboard shortcuts" fallback={() => null}>
        <KeyboardShortcutsOverlay />
      </ErrorBoundary>
      <ErrorBoundary label="update notification" fallback={() => null}>
        <UpdateNotificationDialog />
      </ErrorBoundary>
      <DragGhost />
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
