/**
 * Fill progress follows the real timestamp interval. Long syllables therefore
 * advance more slowly than short ones, with gentle acceleration/deceleration.
 */
export function wordFillProgress(
  currentTime: number,
  startTime: number,
  endTime: number
): number {
  const duration = Math.max(0.05, endTime - startTime)
  if (currentTime <= startTime) return 0
  if (currentTime >= endTime) return 1
  const linear = Math.max(0, Math.min(1, (currentTime - startTime) / duration))

  // Short syllables may rise gently; held notes stay close to linear. Completion
  // remains locked to the source end boundary instead of leading the vocal.
  const heldRatio = Math.max(0, Math.min(1, (duration - 0.25) / 1.0))
  const exponent = 1.55 + (1.08 - 1.55) * heldRatio
  return 1 - Math.pow(1 - linear, exponent)
}
