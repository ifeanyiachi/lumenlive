import type { Step } from "react-joyride"

const STEP_DEFAULTS = {
  skipBeacon: true,
} as const satisfies Partial<Step>

export const TUTORIAL_STEPS: Step[] = [
  {
    ...STEP_DEFAULTS,
    target: '[data-slot="schedule-panel"]',
    title: "Schedule",
    content:
      "Build your service run sheet here. Add verses, media, slides, and YouTube items, then reorder to match your flow.",
    placement: "right",
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-slot="transcript-panel"]',
    title: "Live Transcript",
    content:
      "Start transcribing to convert speech to text in real time. Detected Bible verses are highlighted automatically.",
    placement: "bottom",
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-slot="detections-panel"]',
    title: "AI Detections",
    content:
      "Detected verses appear here. Press Present to display a verse on screen, or Queue to save it for later.",
    placement: "left",
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="ai-verses"]',
    title: "AI Verses",
    content:
      "Detected verses with high confidence automatically land here. Review, reorder, and present them during your service.",
    placement: "right",
    spotlightPadding: 2,
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="quick-tabs"]',
    title: "Quick Tabs",
    content:
      "Quickly switch between Verse, Media, and Slide items for easy drag-and-drop into your schedule list.",
    placement: "bottom",
    spotlightPadding: 2,
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="book-search"]',
    title: "Book Search",
    content:
      "Look up any verse by book, chapter, and number. Switch translations from the dropdown.",
    placement: "bottom",
    spotlightPadding: 2,
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="context-search"]',
    title: "Context Search",
    content:
      "Search by phrase or topic. LumenLive uses AI to find matching verses.",
    placement: "bottom",
    spotlightPadding: 2,
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="quick-nav"]',
    title: "Quick Navigation",
    content:
      "Type to instantly navigate: 'J' → 'Joshua' or '1 J' → '1 John', press Tab to advance stages, then type chapter and verse.",
    placement: "bottom",
    spotlightPadding: 2,
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-slot="preview-panel"]',
    title: "Programme Preview",
    content:
      "Preview how your schedule items will look before going live. What you see here is what your audience sees.",
    placement: "bottom",
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-slot="live-output-panel"]',
    title: "Live Display",
    content:
      "The live output. Presented verses appear here and on connected displays or NDI outputs.",
    placement: "bottom",
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="view-switcher"]',
    title: "Views",
    content:
      "Switch between Slides, Media, and YouTube tabs to manage other content types alongside your live service.",
    placement: "bottom",
    spotlightPadding: 4,
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="broadcast"]',
    title: "Broadcast",
    content:
      "Configure NDI output, display windows, and resolution for your production setup.",
    placement: "bottom",
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="theme"]',
    title: "Theme Designer",
    content:
      "Design how your broadcast looks — fonts, colours, backgrounds, and layouts for verses on screen.",
    placement: "bottom",
  },
  {
    ...STEP_DEFAULTS,
    target: '[data-tour="settings"]',
    title: "Settings",
    content:
      "Configure audio input, Bible translations, display mode, remote control, and API keys.",
    placement: "bottom",
  },
]
