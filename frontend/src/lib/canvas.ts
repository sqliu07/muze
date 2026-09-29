/** Resize backing storage only when layout or device pixel ratio changes. */
export function observeCanvasSize(canvas: HTMLCanvasElement, onResize: (width: number, height: number) => void): () => void {
  let resolution: MediaQueryList | undefined
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
    canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0)
    onResize(width, height)
  }
  const watchResolution = () => {
    resolution?.removeEventListener("change", watchResolution)
    resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    resolution.addEventListener("change", watchResolution)
    resize()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  watchResolution()
  return () => {
    observer.disconnect()
    resolution?.removeEventListener("change", watchResolution)
  }
}
