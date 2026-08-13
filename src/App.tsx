import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { curatedById, featuredExample } from './lib/curated'
import {
  formatDistance,
  getCurrentPosition,
  GeoError,
  watchPosition,
  type GeoPosition,
} from './lib/geolocation'
import './App.css'

type Screen = 'home' | 'experience' | 'places'

const RADII = [50, 90, 150, 250, 400] as const

const defaultAlign = (photo: HistoricPhoto | null): OverlayAlign =>
  photo?.align ?? { scale: 1, x: 0, y: 0 }

function indexInDecade(
  photos: HistoricPhoto[],
  pageId: number | null,
): { decade: number | null | undefined; index: number } {
  if (pageId == null) return { decade: undefined, index: 0 }
  const groups = groupByDecade(photos)
  for (const group of groups) {
    const index = group.photos.findIndex((p) => p.pageId === pageId)
    if (index >= 0) return { decade: group.decade, index }
  }
  return { decade: undefined, index: 0 }
}

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
  /** Evita que un refetch GPS borre la foto que el usuario eligió */
  const pinnedPageId = useRef<number | null>(null)
  const skipWatchReload = useRef(false)

  const groups = useMemo(() => groupByDecade(photos), [photos])

  const decadePhotos = useMemo(() => {
    if (!groups.length) return []
    if (activeDecade === undefined) return groups[0]?.photos ?? []
    return groups.find((g) => g.decade === activeDecade)?.photos ?? []
  }, [groups, activeDecade])

  const activePhoto = decadePhotos[photoIndex] ?? decadePhotos[0] ?? null

  const applyFound = useCallback(
    (found: HistoricPhoto[], opts: { resetSelection: boolean }) => {
      setPhotos(found)

      if (opts.resetSelection || pinnedPageId.current == null) {
        const first = found[0] ?? null
        pinnedPageId.current = first?.pageId ?? null
        setPhotoIndex(0)
        setActiveDecade(undefined)
        if (first) {
          setOpacity(0.55)
          setAlign(defaultAlign(first))
        }
      } else {
        const kept = found.find((p) => p.pageId === pinnedPageId.current)
        if (kept) {
          const loc = indexInDecade(found, kept.pageId)
          setActiveDecade(loc.decade)
          setPhotoIndex(loc.index)
        } else {
          const first = found[0] ?? null
          pinnedPageId.current = first?.pageId ?? null
          setPhotoIndex(0)
          setActiveDecade(undefined)
          if (first) {
            setOpacity(0.55)
            setAlign(defaultAlign(first))
          }
        }
      }

      const selected =
        found.find((p) => p.pageId === pinnedPageId.current) ?? found[0]
      if (selected?.curated && selected.matchRadiusM != null) {
        if (selected.distanceM > selected.matchRadiusM) {
          setStatus(
            `Vista previa · estás a ${formatDistance(selected.distanceM)} del punto (ideal bajo ${selected.matchRadiusM} m)`,
          )
        } else {
          setStatus(null)
        }
      } else if (!found.length) {
        setStatus(
          `No hay fotos históricas a menos de ${radius} m. Amplía el radio o prueba un lugar del mapa.`,
        )
      } else {
        setStatus(null)
      }
    },
    [radius],
  )

  const loadNearby = useCallback(
    async (
      pos: GeoPosition,
      r: number,
      opts: { resetSelection: boolean } = { resetSelection: false },
    ) => {
      setBusy(true)
      if (opts.resetSelection) setStatus('Buscando fotos…')
      setError(null)
      try {
        const found = await fetchHistoricPhotosNearby(pos.lat, pos.lon, r)
        applyFound(found, opts)
      } catch {
        setError('No pudimos cargar fotos cercanas. Intenta de nuevo.')
        setStatus(null)
      } finally {
        setBusy(false)
      }
    },
    [applyFound],
  )

  const openCuratedPhoto = useCallback(async (curatedId?: string) => {
    setBusy(true)
    setError(null)
    setCameraError(null)
    setStatus('Abriendo foto…')
    skipWatchReload.current = true
    try {
      let pos: GeoPosition
      try {
        pos = await getCurrentPosition()
      } catch {
        const seed = featuredExample()
        pos = { lat: seed.lat, lon: seed.lon, accuracy: 0 }
      }
      setPosition(pos)
      const photo =
        (curatedId ? curatedById(curatedId, pos) : null) ?? featuredExample(pos)
      pinnedPageId.current = photo.pageId
      setPhotos([photo])
      setActiveDecade(photo.decade)
      setPhotoIndex(0)
      setOpacity(0.55)
      setAlign(defaultAlign(photo))
      setInfoOpen(false)
      if (photo.matchRadiusM != null && photo.distanceM > photo.matchRadiusM) {
        setStatus(
          `Vista previa · estás a ${formatDistance(photo.distanceM)} del lugar`,
        )
      } else {
        setStatus(null)
      }
      setScreen('experience')
    } catch {
      setError('No pudimos abrir la foto.')
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
    skipWatchReload.current = false
    pinnedPageId.current = null
    try {
      const pos = await getCurrentPosition()
      setPosition(pos)
      setScreen('experience')
      await loadNearby(pos, radius, { resetSelection: true })
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

  // Solo actualiza GPS; no recarga la galería (evita quitar la foto elegida)
  useEffect(() => {
    if (screen !== 'experience') return
    return watchPosition((pos) => {
      setPosition(pos)
    })
  }, [screen])

  useEffect(() => {
    if (screen !== 'experience' || !position) return
    if (skipWatchReload.current) return
    void loadNearby(position, radius, { resetSelection: false })
  }, [radius]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activePhoto) return
    if (pinnedPageId.current === activePhoto.pageId) return
    setAlign(defaultAlign(activePhoto))
    setOpacity(0.55)
  }, [activePhoto?.pageId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDecadeSelect = (decade: number | null) => {
    setActiveDecade(decade)
    setPhotoIndex(0)
    const group = groups.find((g) => g.decade === decade) ?? groups[0]
    pinnedPageId.current = group?.photos[0]?.pageId ?? null
  }

  const cyclePhoto = (dir: 1 | -1) => {
    if (decadePhotos.length < 2) return
    setPhotoIndex((i) => {
      const next = (i + dir + decadePhotos.length) % decadePhotos.length
      pinnedPageId.current = decadePhotos[next]?.pageId ?? null
      return next
    })
  }

  if (screen === 'places') {
    return (
      <PlacesMap
        user={position}
        locating={busy}
        onBack={() => setScreen('home')}
        onLocate={() => void locateForMap()}
        onOpenCurated={(curatedId) => void openCuratedPhoto(curatedId)}
      />
    )
  }

  if (screen === 'home') {
    return (
      <div className="shell home">
        <div className="home-atmosphere" aria-hidden />
        <header className="home-brand">
          <p className="brand-mark">AyerAquí</p>
          <h1 className="brand-line">Mira cómo era este lugar</h1>
          <p className="brand-sub">
            Superpone fotos históricas sobre la cámara según tu ubicación, o
            ábrelas desde el mapa.
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
            pinnedPageId.current = null
            skipWatchReload.current = false
            setInfoOpen(false)
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
              <button
                type="button"
                className="btn-mini"
                onClick={() => setInfoOpen((v) => !v)}
              >
                {infoOpen ? 'Ocultar ficha' : 'Ver ficha'}
              </button>
            </div>

            {infoOpen && (
              <div className="photo-fiche">
                {activePhoto.work ? (
                  <p>
                    <span>Obra</span>
                    {activePhoto.work}
                    {activePhoto.artist ? ` — ${activePhoto.artist}` : ''}
                  </p>
                ) : (
                  <p>
                    <span>Título</span>
                    {activePhoto.title}
                  </p>
                )}
                {activePhoto.place && (
                  <p>
                    <span>Ubicación</span>
                    {activePhoto.place}
                  </p>
                )}
                {activePhoto.artist && !activePhoto.work && (
                  <p>
                    <span>Autor</span>
                    {activePhoto.artist}
                  </p>
                )}
                <p>
                  <span>Coordenadas del punto</span>
                  {activePhoto.lat.toFixed(5)}, {activePhoto.lon.toFixed(5)} · a{' '}
                  {formatDistance(activePhoto.distanceM)}
                  {activePhoto.matchRadiusM
                    ? ` (ideal bajo ${activePhoto.matchRadiusM} m)`
                    : ''}
                </p>
                {activePhoto.year != null && (
                  <p>
                    <span>Año / década</span>
                    {activePhoto.year}
                    {activePhoto.decade != null ? ` · ${activePhoto.decade}s` : ''}
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
                {activePhoto.license && (
                  <p className="photo-credit">Licencia: {activePhoto.license}</p>
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
