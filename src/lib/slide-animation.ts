import type {
  ElementAnimation,
  ElementAnimationType,
  TextBuildAnimation,
} from "@/types/slide"

// ── Easing functions ──

type EasingFn = (t: number) => number

const easings: Record<string, EasingFn> = {
  linear: (t) => t,
  "ease-in": (t) => t * t,
  "ease-out": (t) => t * (2 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
}

export function getEasing(name: string): EasingFn {
  return easings[name] ?? easings.linear
}

// ── Animation state per slide ──

export interface ElementAnimationState {
  opacity: number
  translateX: number
  translateY: number
  scale: number
}

const IDENTITY_STATE: ElementAnimationState = {
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scale: 1,
}

export function computeEntryState(
  anim: ElementAnimation,
  elapsed: number
): ElementAnimationState {
  if (anim.type === "none") return IDENTITY_STATE

  const delayedElapsed = Math.max(0, elapsed - anim.delay)
  const rawProgress =
    anim.duration > 0 ? Math.min(delayedElapsed / anim.duration, 1) : 1
  const progress = getEasing(anim.easing)(rawProgress)

  return applyAnimationType(anim.type, progress)
}

export function computeExitState(
  anim: ElementAnimation,
  elapsed: number
): ElementAnimationState {
  if (anim.type === "none") return IDENTITY_STATE

  const delayedElapsed = Math.max(0, elapsed - anim.delay)
  const rawProgress =
    anim.duration > 0 ? Math.min(delayedElapsed / anim.duration, 1) : 1
  const progress = getEasing(anim.easing)(rawProgress)

  return applyAnimationType(anim.type, 1 - progress)
}

function applyAnimationType(
  type: ElementAnimationType,
  progress: number
): ElementAnimationState {
  switch (type) {
    case "fade":
      return { opacity: progress, translateX: 0, translateY: 0, scale: 1 }
    case "slide-left":
      return {
        opacity: 1,
        translateX: -(1 - progress) * 100,
        translateY: 0,
        scale: 1,
      }
    case "slide-right":
      return {
        opacity: 1,
        translateX: (1 - progress) * 100,
        translateY: 0,
        scale: 1,
      }
    case "slide-up":
      return {
        opacity: 1,
        translateX: 0,
        translateY: -(1 - progress) * 100,
        scale: 1,
      }
    case "slide-down":
      return {
        opacity: 1,
        translateX: 0,
        translateY: (1 - progress) * 100,
        scale: 1,
      }
    case "scale":
      return {
        opacity: progress,
        translateX: 0,
        translateY: 0,
        scale: 0.3 + progress * 0.7,
      }
    default:
      return IDENTITY_STATE
  }
}

// ── Text build progress ──

export function computeTextBuildProgress(
  build: TextBuildAnimation,
  elapsed: number,
  totalItems: number
): number {
  if (build.type === "none" || totalItems <= 0) return totalItems

  const delayedElapsed = Math.max(0, elapsed - build.delay)
  const totalDuration = build.duration * totalItems
  if (totalDuration <= 0) return totalItems

  const progress = Math.min(delayedElapsed / totalDuration, 1)
  return progress * totalItems
}

// ── Slide animation tracker ──

export interface SlideAnimationTracker {
  startTime: number
  elementStates: Map<string, ElementAnimationState>
  textBuildProgress: Map<string, number>
  isComplete: boolean
}

export function createSlideAnimationTracker(): SlideAnimationTracker {
  return {
    startTime: performance.now(),
    elementStates: new Map(),
    textBuildProgress: new Map(),
    isComplete: false,
  }
}

export function isAnimationActive(
  tracker: SlideAnimationTracker | null
): boolean {
  return tracker !== null && !tracker.isComplete
}

export interface AnimatedSlideInfo {
  elements: Array<{
    id: string
    animation?: { entry?: ElementAnimation; exit?: ElementAnimation }
    textBuild?: TextBuildAnimation
    textLineCount?: number
    textWordCount?: number
  }>
}

export function updateAnimationTracker(
  tracker: SlideAnimationTracker,
  slide: AnimatedSlideInfo,
  now: number
): void {
  const elapsed = now - tracker.startTime
  let allComplete = true

  for (const el of slide.elements) {
    const entry = el.animation?.entry
    if (entry && entry.type !== "none") {
      const state = computeEntryState(entry, elapsed)
      tracker.elementStates.set(el.id, state)

      const totalTime = entry.delay + entry.duration
      if (elapsed < totalTime) allComplete = false
    }

    const build = el.textBuild
    if (build && build.type !== "none") {
      const itemCount =
        build.type === "line-by-line"
          ? (el.textLineCount ?? 1)
          : (el.textWordCount ?? 1)
      const progress = computeTextBuildProgress(build, elapsed, itemCount)
      tracker.textBuildProgress.set(el.id, progress)

      const totalTime = build.delay + build.duration * itemCount
      if (elapsed < totalTime) allComplete = false
    }
  }

  tracker.isComplete = allComplete
}

export function getElementAnimState(
  tracker: SlideAnimationTracker | null,
  elementId: string
): ElementAnimationState {
  if (!tracker) return IDENTITY_STATE
  return tracker.elementStates.get(elementId) ?? IDENTITY_STATE
}

export function getTextBuildProgress(
  tracker: SlideAnimationTracker | null,
  elementId: string
): number | undefined {
  if (!tracker) return undefined
  return tracker.textBuildProgress.get(elementId)
}
