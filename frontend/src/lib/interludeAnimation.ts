export type InterludePhase = "hidden" | "active" | "exiting" | "collapsing"

export interface InterludeMotion {
  phase: InterludePhase
  breathPhase: number
  exitProgress: number
  collapseProgress: number
  exitStart: number
  exitEnd: number
}

interface ResolveInterludeMotionOptions {
  currentTime: number
  interludeStart: number
  nextLineTime: number
  hideBefore: number
  exitDuration: number
  breatheDuration: number
}

interface InterludeDotVisualOptions {
  phase: InterludePhase
  breathPhase: number
  exitProgress: number
  scaleMin: number
  scaleMax: number
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function easeInOutCubic(value: number): number {
  const t = clamp01(value)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeInCubic(value: number): number {
  const t = clamp01(value)
  return t * t * t
}

export function resolveInterludeMotion({
  currentTime,
  interludeStart,
  nextLineTime,
  hideBefore,
  exitDuration,
  breatheDuration,
}: ResolveInterludeMotionOptions): InterludeMotion {
  const exitStart = nextLineTime - hideBefore
  const exitEnd = Math.min(nextLineTime, exitStart + exitDuration)
  const hidden = {
    phase: "hidden" as const,
    breathPhase: 0,
    exitProgress: 0,
    collapseProgress: 0,
    exitStart,
    exitEnd,
  }

  if (currentTime < interludeStart || currentTime >= nextLineTime) return hidden

  if (currentTime < exitStart) {
    return {
      ...hidden,
      phase: "active",
      // Anchor the loop so it reaches scale 1 exactly when the exit begins.
      breathPhase: positiveModulo((currentTime - exitStart) / breatheDuration, 1),
    }
  }

  if (currentTime < exitEnd) {
    return {
      ...hidden,
      phase: "exiting",
      exitProgress: clamp01((currentTime - exitStart) / Math.max(0.001, exitEnd - exitStart)),
    }
  }

  return {
    ...hidden,
    phase: "collapsing",
    exitProgress: 1,
    collapseProgress: clamp01((currentTime - exitEnd) / Math.max(0.001, nextLineTime - exitEnd)),
  }
}

export function interludeDotVisual({
  phase,
  breathPhase,
  exitProgress,
  scaleMin,
  scaleMax,
}: InterludeDotVisualOptions): { scale: number; opacity: number } {
  if (phase === "hidden" || phase === "collapsing") {
    // Vanish at the smallest breathing scale; do not visibly shrink toward zero.
    return { scale: scaleMin, opacity: 0 }
  }

  if (phase === "active") {
    const wave = Math.sin(breathPhase * Math.PI * 2)
    const scale = wave >= 0
      ? 1 + wave * (scaleMax - 1)
      : 1 + wave * (1 - scaleMin)
    return {
      scale,
      opacity: 0.62 + wave * 0.18,
    }
  }

  const progress = clamp01(exitProgress)
  if (progress <= 0.64) {
    const eased = easeInOutCubic(progress / 0.64)
    return {
      scale: 1 + (scaleMax - 1) * eased,
      opacity: 0.62 + (0.94 - 0.62) * eased,
    }
  }
  const eased = easeInCubic((progress - 0.64) / 0.36)
  return {
    scale: scaleMax + (scaleMin - scaleMax) * eased,
    opacity: 0.94 + (0.62 - 0.94) * eased,
  }
}
