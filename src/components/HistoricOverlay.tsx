import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { HistoricPhoto } from '../lib/commonsApi'

export type OverlayAlign = {
  scale: number
  x: number
  y: number
}

/** Recorte en % desde cada borde (0 = sin recorte). */
export type OverlayCrop = {
  top: number
  right: number
  bottom: number
  left: number
}

export const EMPTY_CROP: OverlayCrop = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

type Props = {
  photo: HistoricPhoto | null
  /** 0 = solo cámara, 1 = solo foto antigua */
  opacity: number
  onOpacityChange: (value: number) => void
  align: OverlayAlign
  onAlignChange: (align: OverlayAlign) => void
  crop: OverlayCrop
  onCropChange: (crop: OverlayCrop) => void
}

type UiMode = 'blend' | 'pan' | 'crop'
type DragMode = 'blend' | 'pan' | null

const SCALE_MIN = 0.25
const SCALE_MAX = 4
const clampScale = (value: number) =>
  Math.min(SCALE_MAX, Math.max(SCALE_MIN, value))

export function HistoricOverlay({
  photo,
  opacity,
  onOpacityChange,
  align,
  onAlignChange,
  crop,
  onCropChange,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<UiMode>('blend')
  const [hintOpen, setHintOpen] = useState(true)
  const [dragging, setDragging] = useState<DragMode>(null)
  const dragStart = useRef<{
    x: number
    y: number
    alignX: number
    alignY: number
    opacity: number
  } | null>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null)
  const alignRef = useRef(align)
  alignRef.current = align

  useEffect(() => {
    setMode('blend')
    setHintOpen(true)
  }, [photo?.pageId])

  useEffect(() => {
    setHintOpen(true)
    const timer = window.setTimeout(() => setHintOpen(false), 4200)
    return () => window.clearTimeout(timer)
  }, [mode, photo?.pageId])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === 'crop') return
    setHintOpen(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && mode === 'pan') {
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      pinchStart.current = { dist, scale: align.scale }
      setDragging('pan')
      return
    }

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      alignX: align.x,
      alignY: align.y,
      opacity,
    }
    setDragging(mode)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === 'crop') return
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && mode === 'pan' && pinchStart.current) {
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (dist < 8) return
      const nextScale = clampScale(
        (pinchStart.current.scale * dist) / pinchStart.current.dist,
      )
      onAlignChange({ ...alignRef.current, scale: nextScale })
      return
    }

    if (!dragging || !dragStart.current) return

    if (dragging === 'blend') {
      const el = layerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const next = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width),
      )
      onOpacityChange(next)
      return
    }

    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    onAlignChange({
      ...align,
      x: dragStart.current.alignX + (dx / window.innerWidth) * 100,
      y: dragStart.current.alignY + (dy / window.innerHeight) * 100,
    })
  }

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 0) {
      setDragging(null)
      dragStart.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
  }

  const setScale = (value: number) => {
    onAlignChange({ ...align, scale: clampScale(value) })
  }

  const setCropSide = (side: keyof OverlayCrop, value: number) => {
    const next = Math.min(40, Math.max(0, value))
    onCropChange({ ...crop, [side]: next })
  }

  if (!photo) return null

  const clip = `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`

  return (
    <div className={`overlay-root ${dragging ? 'is-dragging' : ''} mode-${mode}`}>
      <div
        className="overlay-historic"
        style={{
          opacity,
          transform: `translate(${align.x}%, ${align.y}%) scale(${align.scale})`,
          clipPath: clip,
        }}
      >
        <img
          src={photo.fullUrl}
          alt={photo.title}
          draggable={false}
          className="overlay-image"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>

      {mode === 'crop' && (
        <div
          className="crop-frame"
          style={{
            top: `${crop.top}%`,
            right: `${crop.right}%`,
            bottom: `${crop.bottom}%`,
            left: `${crop.left}%`,
          }}
          aria-hidden
        />
      )}

      <div
        ref={layerRef}
        className="overlay-gestures"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      />

      <div className="overlay-chrome">
        <div className="overlay-mode">
          <button
            type="button"
            className={mode === 'blend' ? 'is-active' : ''}
            onClick={() => setMode('blend')}
          >
            Sobreponer
          </button>
          <button
            type="button"
            className={mode === 'pan' ? 'is-active' : ''}
            onClick={() => setMode('pan')}
          >
            Alinear
          </button>
          <button
            type="button"
            className={mode === 'crop' ? 'is-active' : ''}
            onClick={() => setMode('crop')}
          >
            Recortar
          </button>
        </div>

        <div className="blend-row">
          <span>Ahora</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            aria-label="Opacidad de la foto antigua"
            onChange={(e) => onOpacityChange(Number(e.target.value))}
          />
          <span>Antes</span>
        </div>

        {mode === 'pan' && (
          <div className="size-row">
            <span>Chica</span>
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={0.01}
              value={align.scale}
              aria-label="Tamaño de la foto antigua"
              onChange={(e) => setScale(Number(e.target.value))}
            />
            <span>Grande</span>
            <button
              type="button"
              className="size-reset"
              onClick={() =>
                onAlignChange(photo.align ?? { scale: 1, x: 0, y: 0 })
              }
            >
              Reset
            </button>
          </div>
        )}

        {mode === 'crop' && (
          <div className="crop-controls">
            {(
              [
                ['top', 'Arriba'],
                ['bottom', 'Abajo'],
                ['left', 'Izq'],
                ['right', 'Der'],
              ] as const
            ).map(([side, label]) => (
              <label key={side} className="crop-slider">
                <span>{label}</span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={crop[side]}
                  onChange={(e) => setCropSide(side, Number(e.target.value))}
                />
                <em>{Math.round(crop[side])}%</em>
              </label>
            ))}
            <button
              type="button"
              className="btn-mini crop-reset"
              onClick={() => onCropChange(EMPTY_CROP)}
            >
              Quitar recorte
            </button>
          </div>
        )}
      </div>

      {hintOpen && (
        <div className="overlay-hint">
          <span>
            {mode === 'blend' && 'Desliza para mezclar cámara y foto'}
            {mode === 'pan' && 'Arrastra para mover · usa la barra para el tamaño'}
            {mode === 'crop' && 'Ajusta los bordes para recortar la foto antigua'}
          </span>
          <button
            type="button"
            className="overlay-hint-close"
            aria-label="Cerrar aviso"
            onClick={() => setHintOpen(false)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
