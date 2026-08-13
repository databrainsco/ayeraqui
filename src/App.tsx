import { useCallback, useEffect, useMemo, useState } from 'react'
import { CameraView } from './components/CameraView'
import { DecadeStrip } from './components/DecadeStrip'
import {
  HistoricOverlay,
  type OverlayAlign,
} from './components/HistoricOverlay'
import { PlacesMap } from './components/PlacesMap'
import {
  fetchHistoricPhotosNearby,
  groupByDecade,
  type HistoricPhoto,
} from './lib/commonsApi'
import { featuredHeroUrl, nearestCuratedHint } from './lib/curated'
import {
  formatDistance,
  getCurrentPosition,
  GeoError,
  watchPosition,
  type GeoPosition,
} from './lib/geolocation'
import './App.css'

type Screen = 'home' | 'experience' | 'places'

/** Radios cortos: la foto solo aparece si estás cerca del punto. */
const RADII = [50, 90, 150, 250, 400] as const

const defaultAlign = (photo: HistoricPhoto | null): OverlayAlign =>
  photo?.align ?? { scale: 1, x: 0, y: 0 }

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [photos, setPhotos] = useState<HistoricPhoto[]>([])
  const [radius, setRadius] = useState<(typeof RADII)[number]>(90)
  const [activeDecade, setActiveDecade] = useState<number | null | undefined>(
    undefined,
  )
  const [photoIndex, setPhotoIndex] = useState(0)
  const [opacity, setOpacity] = useState(0.55)
  const [align, setAlign] = useState<OverlayAlign>({ scale: 1, x: 0, y: 0 })
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const heroUrl = useMemo(() => featuredHeroUrl(), [])

  const groups = useMemo(() => groupByDecade(photos), [photos])

  const decadePhotos = useMemo(() => {
    if (!groups.length) return []
    if (activeDecade === undefined) return groups[0]?.photos ?? []
    return groups.find((g) => g.decade === activeDecade)?.photos ?? []
  }, [groups, activeDecade])

  const activePhoto = decadePhotos[photoIndex] ?? decadePhotos[0] ?? null

  const loadNearby = useCallback(async (pos: GeoPosition, r: number) => {
    setBusy(true)
    setStatus('Buscando fotos en tu punto exacto…')
    setError(null)
    try {
      const found = await fetchHistoricPhotosNearby(pos.lat, pos.lon, r)
      setPhotos(found)
      setPhotoIndex(0)
      setActiveDecade(undefined)

      if (!found.length) {
        const hint = nearestCuratedHint(pos)
        if (hint && hint.distanceM > hint.matchRadiusM) {
          setStatus(
            `Estás a ${formatDistance(hint.distanceM)} del punto de «${hint.title}». Acércate a menos de ${hint.matchRadiusM} m.`,
          )
        } else {
          setStatus(
            `No hay fotos históricas a menos de ${r} m. Acércate al lugar o amplía un poco el radio.`,
          )
        }
      } else {
        setStatus(null)
        setOpacity(0.55)
        setAlign(defaultAlign(found[0]))
        setInfoOpen(Boolean(found[0]?.curated))
      }
    } catch {
      setError('No pudimos cargar fotos cercanas. Intenta de nuevo.')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const start = useCallback(async () => {
    setBusy(true)
    setError(null)
    setCameraError(null)
    setStatus('Obteniendo ubicación precisa…')
    try {
      const pos = await getCurrentPosition()
      setPosition(pos)
      setScreen('experience')
      await loadNearby(pos, radius)
    } catch (err) {
      const message =
        err instanceof GeoError
          ? err.message
          : 'No pudimos iniciar la experiencia.'
      setError(message)
      setStatus(null)
      setBusy(false)
    }
  }, [loadNearby, radius])

  const locateForMap = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const pos = await getCurrentPosition()
      setPosition(pos)
    } catch (err) {
      setError(
        err instanceof GeoError
          ? err.message
          : 'No pudimos obtener tu ubicación.',
      )
    } finally {
      setBusy(false)
    }
  }, [])

  // Seguir GPS en vivo para activar/desactivar overlay al acercarte
  useEffect(() => {
    if (screen !== 'experience') return
    let lastFetch = 0
    const stop = watchPosition((pos) => {
      setPosition(pos)
      const now = Date.now()
      if (now - lastFetch < 8000) return
      lastFetch = now
      void loadNearby(pos, radius)
    })
    return stop
  }, [screen, radius, loadNearby])

  useEffect(() => {
    if (screen !== 'experience' || !position) return
    void loadNearby(position, radius)
  }, [radius]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activePhoto) return
    setAlign(defaultAlign(activePhoto))
    setOpacity(0.55)
  }, [activePhoto?.pageId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDecadeSelect = (decade: number | null) => {
    setActiveDecade(decade)
    setPhotoIndex(0)
    setInfoOpen(true)
  }

  const cyclePhoto = (dir: 1 | -1) => {
    if (decadePhotos.length < 2) return
    setPhotoIndex((i) => (i + dir + decadePhotos.length) % decadePhotos.length)
    setInfoOpen(true)
  }

  if (screen === 'places') {
    return (
      <PlacesMap
        user={position}
        locating={busy}
        onBack={() => setScreen('home')}
        onLocate={() => void locateForMap()}
      />
    )
  }

  if (screen === 'home') {
    return (
      <div className="shell home">
        <div className="home-atmosphere" aria-hidden />
        <div className="home-hero-photo" aria-hidden>
          <img src={heroUrl} alt="" />
        </div>
        <header className="home-brand">
          <p className="brand-mark">AyerAquí</p>
          <h1 className="brand-line">Mira cómo era este lugar</h1>
          <p className="brand-sub">
            La foto antigua solo aparece si estás cerca del punto exacto.
            Superponla sobre la cámara y alinéala con el edificio.
          </p>
        </header>
        <div className="home-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void start()}
            disabled={busy}
          >
            {busy ? 'Preparando…' : 'Abrir cámara aquí'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setError(null)
              setScreen('places')
            }}
          >
            Mapa de lugares
          </button>
          <p className="home-featured-note">
            Ejemplo curado: mural de Siqueiros en Rectoría UNAM — se activa a
            ~90 m del punto de vista en la plaza poniente.
          </p>
          {error && <p className="banner-error">{error}</p>}
          {status && !error && <p className="banner-status">{status}</p>}
        </div>
        <p className="home-credit">Fotos curadas + Wikimedia Commons</p>
      </div>
    )
  }

  return (
    <div className="shell experience">
      <CameraView active onError={setCameraError} />
      <HistoricOverlay
        photo={activePhoto}
        opacity={opacity}
        onOpacityChange={setOpacity}
        align={align}
        onAlignChange={setAlign}
      />

      <div className="top-bar">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setScreen('home')
            setPhotos([])
            setPosition(null)
          }}
        >
          AyerAquí
        </button>
        <div className="top-meta">
          {position && (
            <span className="meta-pill soft">
              GPS ±{Math.round(position.accuracy)} m
            </span>
          )}
          {activePhoto ? (
            <span className="meta-pill">
              {activePhoto.decade != null
                ? `${activePhoto.decade}s`
                : (activePhoto.year ?? '—')}{' '}
              · {formatDistance(activePhoto.distanceM)}
            </span>
          ) : (
            position && (
              <span className="meta-pill soft">Sin foto en este punto</span>
            )
          )}
        </div>
      </div>

      <div className="bottom-panel">
        {(error || cameraError || status) && (
          <p className={`banner ${error || cameraError ? 'is-error' : ''}`}>
            {error || cameraError || status}
          </p>
        )}

        <DecadeStrip
          groups={groups}
          activeDecade={activeDecade}
          onSelect={onDecadeSelect}
        />

        {activePhoto && (
          <div className="photo-meta">
            <div className="photo-meta-head">
              <p className="photo-title" title={activePhoto.title}>
                {activePhoto.title}
              </p>
              {(activePhoto.context || activePhoto.work) && (
                <button
                  type="button"
                  className="btn-mini"
                  onClick={() => setInfoOpen((v) => !v)}
                >
                  {infoOpen ? 'Ocultar ficha' : 'Ver ficha'}
                </button>
              )}
            </div>

            {infoOpen && (activePhoto.context || activePhoto.work) && (
              <div className="photo-fiche">
                {activePhoto.work && (
                  <p>
                    <span>Obra</span>
                    {activePhoto.work}
                    {activePhoto.artist ? ` — ${activePhoto.artist}` : ''}
                  </p>
                )}
                {activePhoto.place && (
                  <p>
                    <span>Ubicación</span>
                    {activePhoto.place}
                  </p>
                )}
                <p>
                  <span>Coordenadas del punto</span>
                  {activePhoto.lat.toFixed(5)}, {activePhoto.lon.toFixed(5)} · a{' '}
                  {formatDistance(activePhoto.distanceM)}
                  {activePhoto.matchRadiusM
                    ? ` (activo bajo ${activePhoto.matchRadiusM} m)`
                    : ''}
                </p>
                {activePhoto.context && (
                  <p>
                    <span>Contexto</span>
                    {activePhoto.context}
                  </p>
                )}
                {activePhoto.credit && (
                  <p className="photo-credit">{activePhoto.credit}</p>
                )}
              </div>
            )}

            <div className="photo-actions">
              <button
                type="button"
                className="btn-mini"
                onClick={() => cyclePhoto(-1)}
                disabled={decadePhotos.length < 2}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn-mini"
                onClick={() => cyclePhoto(1)}
                disabled={decadePhotos.length < 2}
              >
                Siguiente
              </button>
              <a
                className="btn-mini link"
                href={activePhoto.descriptionUrl}
                target="_blank"
                rel="noreferrer"
              >
                Fuente
              </a>
            </div>
          </div>
        )}

        <div className="radius-row">
          <span>Radio</span>
          <div className="radius-options">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                className={`radius-chip ${radius === r ? 'is-active' : ''}`}
                onClick={() => setRadius(r)}
                disabled={busy}
              >
                {r} m
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
