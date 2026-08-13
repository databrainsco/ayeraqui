import { useCallback, useEffect, useMemo, useState } from 'react'
import { BeforeAfterSlider } from './components/BeforeAfterSlider'
import { CameraView } from './components/CameraView'
import { DecadeStrip } from './components/DecadeStrip'
import {
  fetchHistoricPhotosNearby,
  groupByDecade,
  type HistoricPhoto,
} from './lib/commonsApi'
import { featuredExample } from './lib/curated'
import {
  formatDistance,
  getCurrentPosition,
  GeoError,
  type GeoPosition,
} from './lib/geolocation'
import './App.css'

type Screen = 'home' | 'experience'

const RADII = [300, 500, 1000, 2500, 5000] as const

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [photos, setPhotos] = useState<HistoricPhoto[]>([])
  const [radius, setRadius] = useState<(typeof RADII)[number]>(500)
  const [activeDecade, setActiveDecade] = useState<number | null | undefined>(
    undefined,
  )
  const [photoIndex, setPhotoIndex] = useState(0)
  const [reveal, setReveal] = useState(0.55)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(true)

  const featured = useMemo(() => featuredExample(position), [position])

  const groups = useMemo(() => groupByDecade(photos), [photos])

  const decadePhotos = useMemo(() => {
    if (!groups.length) return []
    if (activeDecade === undefined) return groups[0]?.photos ?? []
    return groups.find((g) => g.decade === activeDecade)?.photos ?? []
  }, [groups, activeDecade])

  const activePhoto = decadePhotos[photoIndex] ?? decadePhotos[0] ?? null

  const loadNearby = useCallback(async (pos: GeoPosition, r: number) => {
    setBusy(true)
    setStatus('Buscando fotos históricas cerca…')
    setError(null)
    try {
      const found = await fetchHistoricPhotosNearby(pos.lat, pos.lon, r)
      setPhotos(found)
      setPhotoIndex(0)
      setActiveDecade(undefined)
      setInfoOpen(true)
      if (!found.length) {
        setStatus(
          `No hay fotos en ${r} m. Prueba ampliar el radio o muévete un poco.`,
        )
      } else {
        setStatus(null)
      }
    } catch {
      setError('No pudimos cargar fotos de Wikimedia Commons. Intenta de nuevo.')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const start = useCallback(async () => {
    setBusy(true)
    setError(null)
    setCameraError(null)
    setStatus('Obteniendo tu ubicación…')
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

  const startFeaturedExample = useCallback(async () => {
    setBusy(true)
    setError(null)
    setCameraError(null)
    setStatus('Cargando ejemplo UNAM 1950s…')
    try {
      let pos: GeoPosition
      try {
        pos = await getCurrentPosition()
      } catch {
        pos = {
          lat: featured.lat,
          lon: featured.lon,
          accuracy: 0,
        }
      }
      setPosition(pos)
      const example = featuredExample(pos)
      setPhotos([example])
      setActiveDecade(1950)
      setPhotoIndex(0)
      setReveal(0.55)
      setInfoOpen(true)
      setStatus(null)
      setScreen('experience')
    } catch {
      setError('No pudimos abrir el ejemplo.')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [featured.lat, featured.lon])

  useEffect(() => {
    if (screen !== 'experience' || !position) return
    void loadNearby(position, radius)
  }, [radius]) // eslint-disable-line react-hooks/exhaustive-deps -- reload only on radius change

  const onDecadeSelect = (decade: number | null) => {
    setActiveDecade(decade)
    setPhotoIndex(0)
    setReveal(0.55)
    setInfoOpen(true)
  }

  const cyclePhoto = (dir: 1 | -1) => {
    if (decadePhotos.length < 2) return
    setPhotoIndex((i) => (i + dir + decadePhotos.length) % decadePhotos.length)
    setReveal(0.55)
    setInfoOpen(true)
  }

  if (screen === 'home') {
    return (
      <div className="shell home">
        <div className="home-atmosphere" aria-hidden />
        <div className="home-hero-photo" aria-hidden>
          <img src={featured.fullUrl} alt="" />
        </div>
        <header className="home-brand">
          <p className="brand-mark">AyerAquí</p>
          <h1 className="brand-line">Mira cómo era este lugar</h1>
          <p className="brand-sub">
            Abre la cámara. Según dónde estés, superponemos fotos históricas por
            década.
          </p>
        </header>
        <div className="home-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void start()}
            disabled={busy}
          >
            {busy ? 'Preparando…' : 'Ver el antes aquí'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void startFeaturedExample()}
            disabled={busy}
          >
            Ejemplo UNAM · 1950s
          </button>
          <p className="home-featured-note">
            Primera imagen: mural de Siqueiros en Rectoría, Ciudad Universitaria
            (1952–1956).
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
      <BeforeAfterSlider
        photo={activePhoto}
        position={reveal}
        onPositionChange={setReveal}
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
        {activePhoto && (
          <span className="meta-pill">
            {activePhoto.decade != null
              ? `${activePhoto.decade}s`
              : (activePhoto.year ?? '—')}{' '}
            ·{' '}
            {activePhoto.curated && activePhoto.distanceM > 5000
              ? 'ejemplo'
              : formatDistance(activePhoto.distanceM)}
          </span>
        )}
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
                {r >= 1000 ? `${r / 1000} km` : `${r} m`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
