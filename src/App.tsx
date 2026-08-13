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
  listUserPhotos,
  userRecordToHistoric,
} from './lib/userPhotos'
import {
  formatDistance,
  getCurrentPosition,
  GeoError,
  watchPosition,
  distanceMeters,
  type GeoPosition,
} from './lib/geolocation'
import './App.css'

type Screen = 'home' | 'experience' | 'places'

const RADII = [50, 90, 150, 250, 400] as const

function defaultAlign(photo: HistoricPhoto | null): OverlayAlign {
  return photo?.align ?? { scale: 1, x: 0, y: 0 }
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
  const [opacity, setOpacity] = useState(0.55)
  const [align, setAlign] = useState<OverlayAlign>({ scale: 1, x: 0, y: 0 })
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  /** null = cámara limpia, sin overlay */
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const skipWatchReload = useRef(false)

  const groups = useMemo(() => groupByDecade(photos), [photos])

  const decadePhotos = useMemo(() => {
    if (!groups.length || activeDecade === undefined) return []
    return groups.find((g) => g.decade === activeDecade)?.photos ?? []
  }, [groups, activeDecade])

  const activePhoto = useMemo(() => {
    if (selectedPageId == null) return null
    return photos.find((p) => p.pageId === selectedPageId) ?? null
  }, [photos, selectedPageId])

  const selectPhoto = useCallback((photo: HistoricPhoto | null) => {
    if (!photo) {
      setSelectedPageId(null)
      setInfoOpen(false)
      return
    }
    setSelectedPageId(photo.pageId)
    setActiveDecade(photo.decade)
    setOpacity(0.55)
    setAlign(defaultAlign(photo))
    setInfoOpen(false)
    setStatus(null)
  }, [])

  const applyFound = useCallback(
    (found: HistoricPhoto[], opts: { resetSelection: boolean }) => {
      setPhotos(found)

      if (opts.resetSelection) {
        setSelectedPageId(null)
        setActiveDecade(undefined)
        setInfoOpen(false)
        if (!found.length) {
          setStatus(
            `No hay fotos históricas a menos de ${radius} m. Amplía el radio o prueba un lugar del mapa.`,
          )
        } else {
          setStatus('Elige una década para superponer')
        }
        return
      }

      setSelectedPageId((current) => {
        if (current == null) return null
        const kept = found.find((p) => p.pageId === current)
        return kept ? current : null
      })

      if (!found.length) {
        setStatus(
          `No hay fotos históricas a menos de ${radius} m. Amplía el radio o prueba un lugar del mapa.`,
        )
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

  const openPlaceInCamera = useCallback(
    async (place: { lat: number; lon: number; name: string }) => {
      setBusy(true)
      setError(null)
      setCameraError(null)
      setStatus(`Cargando fotos de ${place.name}…`)
      skipWatchReload.current = true
      try {
        let devicePos: GeoPosition | null = null
        try {
          devicePos = await getCurrentPosition()
          setPosition(devicePos)
        } catch {
          setPosition({ lat: place.lat, lon: place.lon, accuracy: 0 })
        }

        const found = await fetchHistoricPhotosNearby(place.lat, place.lon, 400)
        const photosForUi = devicePos
          ? found.map((p) => ({
              ...p,
              distanceM: distanceMeters(devicePos, {
                lat: p.lat,
                lon: p.lon,
              }),
            }))
          : found

        setPhotos(photosForUi)
        setSelectedPageId(null)
        setActiveDecade(undefined)
        setInfoOpen(false)
        setStatus(
          photosForUi.length
            ? `Fotos de ${place.name}: elige una década`
            : `No hay fotos cerca de ${place.name}. Prueba otro punto.`,
        )
        setScreen('experience')
      } catch {
        setError('No pudimos abrir ese lugar en la cámara.')
        setStatus(null)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const openUserPhotoInCamera = useCallback(async (photoId: string) => {
    setBusy(true)
    setError(null)
    setCameraError(null)
    setStatus('Abriendo tu foto…')
    skipWatchReload.current = true
    try {
      let pos: GeoPosition
      try {
        pos = await getCurrentPosition()
      } catch {
        pos = { lat: 0, lon: 0, accuracy: 0 }
      }
      const rows = await listUserPhotos()
      const row = rows.find((r) => r.id === photoId)
      if (!row) throw new Error('missing')
      if (pos.lat === 0 && pos.lon === 0) {
        pos = { lat: row.lat, lon: row.lon, accuracy: 0 }
      }
      setPosition(pos)
      const photo = userRecordToHistoric(row, pos)
      setPhotos([photo])
      setSelectedPageId(photo.pageId)
      setActiveDecade(photo.decade)
      setOpacity(0.55)
      setAlign(defaultAlign(photo))
      setInfoOpen(false)
      setStatus(null)
      setScreen('experience')
    } catch {
      setError('No pudimos abrir tu foto.')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [])

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
      setSelectedPageId(photo.pageId)
      setPhotos([photo])
      setActiveDecade(photo.decade)
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
    setSelectedPageId(null)
    setActiveDecade(undefined)
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
    setAlign(defaultAlign(activePhoto))
    setOpacity(0.55)
  }, [activePhoto?.pageId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDecadeSelect = (decade: number | null) => {
    setActiveDecade(decade)
    const group = groups.find((g) => g.decade === decade)
    const first = group?.photos[0] ?? null
    selectPhoto(first)
  }

  const cyclePhoto = (dir: 1 | -1) => {
    if (decadePhotos.length < 2 || selectedPageId == null) return
    const current = decadePhotos.findIndex((p) => p.pageId === selectedPageId)
    const base = current >= 0 ? current : 0
    const next = (base + dir + decadePhotos.length) % decadePhotos.length
    selectPhoto(decadePhotos[next] ?? null)
  }

  if (screen === 'places') {
    return (
      <PlacesMap
        user={position}
        locating={busy}
        onBack={() => setScreen('home')}
        onLocate={() => void locateForMap()}
        onOpenCurated={(curatedId) => void openCuratedPhoto(curatedId)}
        onOpenPlaceCamera={(place) => void openPlaceInCamera(place)}
        onOpenUserPhoto={(id) => void openUserPhotoInCamera(id)}
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
        <p className="home-credit">
          Fotos curadas + Wikimedia Commons
          <span className="app-version">v{__APP_VERSION__}</span>
        </p>
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
            setSelectedPageId(null)
            setActiveDecade(undefined)
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
            <span className="meta-pill soft">Sin foto seleccionada</span>
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
              {activePhoto.descriptionUrl &&
                activePhoto.descriptionUrl !== '#' && (
                  <a
                    className="btn-mini link"
                    href={activePhoto.descriptionUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Fuente
                  </a>
                )}
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
