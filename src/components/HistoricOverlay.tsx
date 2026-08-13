import {
  useCallback,
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

type Props = {
  photo: HistoricPhoto | null
  /** 0 = solo cámara, 1 = solo foto antigua */
  opacity: number
  onOpacityChange: (value: number) => void
  align: OverlayAlign
  onAlignChange: (align: OverlayAlign) => void
}

type DragMode = 'blend' | 'pan' | null

export function HistoricOverlay({
  photo,
  opacity,
  onOpacityChange,
  align,
  onAlignChange,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'blend' | 'pan'>('blend')
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

  useEffect(() => {
    setMode('blend')
  }, [photo?.pageId])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
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
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && mode === 'pan' && pinchStart.current) {
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const nextScale = Math.min(
        2.4,
        Math.max(0.6, (pinchStart.current.scale * dist) / pinchStart.current.dist),
      )
      onAlignChange({ ...align, scale: nextScale })
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

  const nudgeScale = useCallback(
    (delta: number) => {
      onAlignChange({
        ...align,
        scale: Math.min(2.4, Math.max(0.6, align.scale + delta)),
      })
    },
    [align, onAlignChange],
  )

  if (!photo) return null

  return (
    <div className={`overlay-root ${dragging ? 'is-dragging' : ''} mode-${mode}`}>
      <div
        className="overlay-historic"
        style={{
          opacity,
          transform: `translate(${align.x}%, ${align.y}%) scale(${align.scale})`,
        }}
      >
        <img
          src={photo.fullUrl}
          alt={photo.title}
          draggable={false}
          className="overlay-image"
        />
      </div>

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
          <div className="align-row">
            <button type="button" onClick={() => nudgeScale(-0.05)}>
              −
            </button>
            <span>Zoom {Math.round(align.scale * 100)}%</span>
            <button type="button" onClick={() => nudgeScale(0.05)}>
              +
            </button>
            <button
              type="button"
              className="align-reset"
              onClick={() =>
                onAlignChange(photo.align ?? { scale: 1, x: 0, y: 0 })
              }
            >
              Reset
            </button>
          </div>
        )}
      </div>

      <div className="overlay-hint" aria-hidden>
        {mode === 'blend'
          ? 'Desliza para mezclar cámara y foto'
          : 'Arrastra para encajar · pellizca para zoom'}
      </div>
    </div>
  )
}
