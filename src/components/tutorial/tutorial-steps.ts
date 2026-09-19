import type { Step } from "react-joyride"
import type { TFunction } from "i18next"

const STEP_DEFAULTS = {
  skipBeacon: true,
} as const satisfies Partial<Step>

export function tutorialSteps(t: TFunction<"tutorial">): Step[] {
  return [
    {
      ...STEP_DEFAULTS,
      target: '[data-slot="schedule-panel"]',
      title: t("steps.schedule.title"),
      content: t("steps.schedule.content"),
      placement: "right",
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-slot="transcript-panel"]',
      title: t("steps.transcript.title"),
      content: t("steps.transcript.content"),
      placement: "bottom",
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-slot="detections-panel"]',
      title: t("steps.detections.title"),
      content: t("steps.detections.content"),
      placement: "left",
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="ai-verses"]',
      title: t("steps.aiVerses.title"),
      content: t("steps.aiVerses.content"),
      placement: "right",
      spotlightPadding: 2,
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="quick-tabs"]',
      title: t("steps.quickTabs.title"),
      content: t("steps.quickTabs.content"),
      placement: "bottom",
      spotlightPadding: 2,
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="book-search"]',
      title: t("steps.bookSearch.title"),
      content: t("steps.bookSearch.content"),
      placement: "bottom",
      spotlightPadding: 2,
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="context-search"]',
      title: t("steps.contextSearch.title"),
      content: t("steps.contextSearch.content"),
      placement: "bottom",
      spotlightPadding: 2,
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="quick-nav"]',
      title: t("steps.quickNav.title"),
      content: t("steps.quickNav.content"),
      placement: "bottom",
      spotlightPadding: 2,
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-slot="preview-panel"]',
      title: t("steps.preview.title"),
      content: t("steps.preview.content"),
      placement: "bottom",
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-slot="live-output-panel"]',
      title: t("steps.liveDisplay.title"),
      content: t("steps.liveDisplay.content"),
      placement: "bottom",
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="view-switcher"]',
      title: t("steps.views.title"),
      content: t("steps.views.content"),
      placement: "bottom",
      spotlightPadding: 4,
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="broadcast"]',
      title: t("steps.broadcast.title"),
      content: t("steps.broadcast.content"),
      placement: "bottom",
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="theme"]',
      title: t("steps.theme.title"),
      content: t("steps.theme.content"),
      placement: "bottom",
    },
    {
      ...STEP_DEFAULTS,
      target: '[data-tour="settings"]',
      title: t("steps.settings.title"),
      content: t("steps.settings.content"),
      placement: "bottom",
    },
  ]
}
