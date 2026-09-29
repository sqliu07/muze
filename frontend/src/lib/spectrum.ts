/** Fractional FFT bin positions on a perceptual frequency axis. */
export function logarithmicBins(binCount: number, sampleRate: number, count = 64): Float32Array {
  if (binCount < 2 || sampleRate <= 0 || count < 2) return new Float32Array(0)
  const maxHz = Math.min(16000, sampleRate / 2)
  const minHz = Math.min(32, maxHz)
  return Float32Array.from({ length: count }, (_, index) =>
    Math.min(binCount - 1, minHz * (maxHz / minHz) ** (index / (count - 1)) * binCount * 2 / sampleRate)
  )
}

export function sampleSpectrum(data: Uint8Array, bin: number): number {
  if (!data.length || !Number.isFinite(bin)) return 0
  const position = Math.max(0, Math.min(data.length - 1, bin))
  const lower = Math.floor(position)
  const fraction = position - lower
  return ((data[lower] ?? 0) * (1 - fraction) + (data[Math.min(lower + 1, data.length - 1)] ?? 0) * fraction) / 255
}

export function bassEnergy(data: Uint8Array, sampleRate: number): number {
  if (!data.length || sampleRate <= 0) return 0
  const binWidth = sampleRate / (data.length * 2)
  const lo = Math.min(data.length - 1, Math.max(1, Math.floor(20 / binWidth)))
  const hi = Math.min(data.length - 1, Math.max(lo, Math.ceil(150 / binWidth)))
  let sum = 0
  for (let index = lo; index <= hi; index++) sum += data[index] / 255
  return sum / (hi - lo + 1)
}
