import { useCallback, useRef, useState, type PointerEvent } from 'react'
import type { HistoricPhoto } from '../lib/commonsApi'

type Props = {
  photo: HistoricPhoto | null
  position: number
  onPositionChange: (value: number) => void
}

export function BeforeAfterSlider({ photo, position, onPositionChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const next = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      onPositionChange(next)
    },
    [onPositionChange],
  )

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    updateFromClientX(e.clientX)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    updateFromClientX(e.clientX)
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }

  if (!photo) return null

  const pct = position * 100

  return (
    <div
      ref={trackRef}
      className={`ba-layer ${dragging ? 'is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="ba-historic"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <img
          src={photo.fullUrl}
          alt={photo.title}
          draggable={false}
          className="ba-image"
        />
      </div>
      <div className="ba-divider" style={{ left: `${pct}%` }}>
        <div className="ba-handle" aria-hidden>
          <span />
        </div>
      </div>
      <div className="ba-labels" aria-hidden>
        <span className={position > 0.15 ? 'is-on' : ''}>Antes</span>
        <span className={position < 0.85 ? 'is-on' : ''}>Ahora</span>
      </div>
    </div>
  )
}
