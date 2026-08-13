import type { OverlayAlign } from '../components/HistoricOverlay'

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  const scale = Math.max(dw / sw, dh / sh)
  const w = sw * scale
  const h = sh * scale
  const x = (dw - w) / 2
  const y = (dh - h) / 2
  ctx.drawImage(source, x, y, w, h)
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  const scale = Math.min(dw / sw, dh / sh)
  const w = sw * scale
  const h = sh * scale
  const x = (dw - w) / 2
  const y = (dh - h) / 2
  ctx.drawImage(source, x, y, w, h)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la foto histórica'))
    img.src = url
  })
}

export async function composeOverlayFrame(opts: {
  video: HTMLVideoElement
  historicUrl: string
  opacity: number
  align: OverlayAlign
}): Promise<Blob> {
  const video = opts.video
  const vw = video.videoWidth || 1080
  const vh = video.videoHeight || 1920

  const canvas = document.createElement('canvas')
  canvas.width = vw
  canvas.height = vh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')

  // Cámara (cover)
  drawCover(ctx, video, vw, vh, vw, vh)

  // Histórica con contain + align + opacity
  const historic = await loadImage(opts.historicUrl)
  ctx.save()
  ctx.globalAlpha = Math.min(1, Math.max(0, opts.opacity))
  ctx.translate(vw / 2, vh / 2)
  ctx.translate((opts.align.x / 100) * vw, (opts.align.y / 100) * vh)
  ctx.scale(opts.align.scale, opts.align.scale)
  ctx.translate(-vw / 2, -vh / 2)
  drawContain(
    ctx,
    historic,
    historic.naturalWidth,
    historic.naturalHeight,
    vw,
    vh,
  )
  ctx.restore()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  )
  if (!blob) throw new Error('No se pudo generar la imagen')
  return blob
}

export async function saveBlobToDevice(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'AyerAquí' })
      return 'shared'
    } catch (err) {
      // User cancel → stop; other errors fall through to download
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
