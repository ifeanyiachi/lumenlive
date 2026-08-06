import { useState, useEffect, useCallback, useMemo } from "react"
import { Joyride, STATUS, type EventData } from "react-joyride"
import { toast } from "sonner"
import { useSettingsStore } from "@/stores/settings-store"
import {
  useTutorialStore,
  hydrateOnboardingState,
  persistOnboardingComplete,
} from "@/stores/tutorial-store"
import { TUTORIAL_STEPS } from "./tutorial-steps"
import { TutorialTooltip } from "./tutorial-tooltip"

export function TutorialOverlay() {
  const [isHydrated, setIsHydrated] = useState(false)
  const isRunning = useTutorialStore((s) => s.isRunning)
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete)

  const [arrowColor, setArrowColor] = useState<string | undefined>()

  // The app is dark-only, so the card colour never changes — resolve it once.
  useEffect(() => {
    requestAnimationFrame(() => {
      const cardEl = document.querySelector(".bg-card")
      if (cardEl) {
        setArrowColor(getComputedStyle(cardEl).backgroundColor)
      }
    })
  }, [])

  const steps = useMemo(
    () =>
      TUTORIAL_STEPS.map((step) => ({
        ...step,
        arrowColor,
      })),
    [arrowColor]
  )

  useEffect(() => {
    hydrateOnboardingState().then(() => {
      setIsHydrated(true)
    })
  }, [])

  useEffect(() => {
    if (isHydrated && !onboardingComplete) {
      const timer = setTimeout(() => {
        useTutorialStore.getState().startTutorial()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isHydrated, onboardingComplete])

  const handleEvent = useCallback((data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      useTutorialStore.getState().stopTutorial()
      persistOnboardingComplete()

      if (data.status === STATUS.SKIPPED) {
        toast.info("Tutorial skipped", {
          description: "Restart anytime in Settings.",
        })
      }
    }
  }, [])

  if (!isHydrated) return null

  return (
    <Joyride
      steps={steps}
      run={isRunning}
      continuous
      tooltipComponent={TutorialTooltip}
      onEvent={handleEvent}
      options={{
        buttons: ["back", "primary", "skip"],
        skipScroll: true,
        zIndex: 60,
        overlayColor: "rgba(0, 0, 0, 0.5)",
      }}
    />
  )
}
