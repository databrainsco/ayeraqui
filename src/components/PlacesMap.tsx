import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { placesWithDistance, type MapPlace } from '../lib/places'
import { formatDistance, type GeoPosition } from '../lib/geolocation'
import { fetchHistoricPhotosNearby, type HistoricPhoto } from '../lib/commonsApi'
import {
  deleteUserPhoto,
  listUserPhotos,
  objectUrlFor,
  saveUserPhoto,
  type UserPhotoRecord,
} from '../lib/userPhotos'

type Props = {
  user: GeoPosition | null
  onBack: () => void
  onLocate: () => void
  onOpenCurated?: (curatedId: string) => void
  onOpenPlaceCamera?: (place: {
    lat: number
    lon: number
    name: string
  }) => void
  onOpenUserPhoto?: (photoId: string) => void
  locating?: boolean
}

const curatedIcon = L.divIcon({
  className: 'map-pin curated',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const hotspotIcon = L.divIcon({
  className: 'map-pin hotspot',
  html: '<span></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const nearbyIcon = L.divIcon({
  className: 'map-pin nearby',
  html: '<span></span>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
})

const mineIcon = L.divIcon({
  className: 'map-pin mine',
  html: '<span></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const userIcon = L.divIcon({
  className: 'map-pin user',
  html: '<span></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

export function PlacesMap({
  user,
  onBack,
  onLocate,
  onOpenCurated,
  onOpenPlaceCamera,
  onOpenUserPhoto,
  locating,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [selected, setSelected] = useState<MapPlace | null>(null)
  const [nearby, setNearby] = useState<HistoricPhoto[]>([])
  const [nearbyStatus, setNearbyStatus] = useState<string | null>(null)
  const [mine, setMine] = useState<UserPhotoRecord[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [locMode, setLocMode] = useState<'gps' | 'manual'>('gps')
  const [manualLat, setManualLat] = useState('')
  const [manualLon, setManualLon] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const ranked = useMemo(() => placesWithDistance(user), [user])
  const didCenterOnUser = useRef(false)

  const refreshMine = async () => {
    const rows = await listUserPhotos()
    setMine(rows)
  }

  useEffect(() => {
    void refreshMine()
  }, [])

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return

    const center: L.LatLngExpression = user
      ? [user.lat, user.lon]
      : [19.4326, -99.1332]

    const map = L.map(mapEl.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView(center, user ? 13 : 5)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    if (user) didCenterOnUser.current = true

    requestAnimationFrame(() => {
      map.invalidateSize()
    })

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!user || !mapRef.current || didCenterOnUser.current) return
    didCenterOnUser.current = true
    mapRef.current.setView([user.lat, user.lon], 13)
  }, [user?.lat, user?.lon])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    for (const place of ranked) {
      const marker = L.marker([place.lat, place.lon], {
        icon: place.kind === 'curated' ? curatedIcon : hotspotIcon,
      })
      marker.bindTooltip(place.name, { direction: 'top', offset: [0, -8] })
      marker.on('click', () => {
        setSelected(place)
        map.flyTo([place.lat, place.lon], 16, { duration: 0.7 })
      })
      marker.addTo(layer)
    }

    for (const photo of nearby) {
      L.marker([photo.lat, photo.lon], { icon: nearbyIcon })
        .bindTooltip(photo.title, { direction: 'top', offset: [0, -6] })
        .addTo(layer)
    }

    for (const minePhoto of mine) {
      L.marker([minePhoto.lat, minePhoto.lon], { icon: mineIcon })
        .bindTooltip(minePhoto.title, { direction: 'top', offset: [0, -6] })
        .on('click', () => {
          map.flyTo([minePhoto.lat, minePhoto.lon], 16, { duration: 0.7 })
        })
        .addTo(layer)
    }

    if (user) {
      L.marker([user.lat, user.lon], { icon: userIcon })
        .bindTooltip('Tú', { direction: 'top' })
        .addTo(layer)
      L.circle([user.lat, user.lon], {
        radius: Math.max(user.accuracy, 40),
        color: '#7ec8b8',
        weight: 1,
        fillOpacity: 0.08,
      }).addTo(layer)
    }
  }, [ranked, nearby, user, mine])

  useEffect(() => {
    if (!user) {
      setNearby([])
      setNearbyStatus(null)
      return
    }
    let cancelled = false
    setNearbyStatus('Buscando fotos Commons cerca de ti…')
    void fetchHistoricPhotosNearby(user.lat, user.lon, 400)
      .then((photos) => {
        if (cancelled) return
        setNearby(photos.filter((p) => !p.curated))
        setNearbyStatus(
          photos.length
            ? `${photos.length} foto(s) detectada(s) en ~400 m`
            : 'No hay fotos Commons a 400 m de tu posición',
        )
      })
      .catch(() => {
        if (!cancelled) setNearbyStatus('No se pudo consultar Commons ahora')
      })
    return () => {
      cancelled = true
    }
  }, [user?.lat, user?.lon])

  const focusPlace = (place: MapPlace) => {
    setSelected(place)
    mapRef.current?.flyTo([place.lat, place.lon], 16, { duration: 0.7 })
  }

  const onSaveMine = async () => {
    setFormError(null)
    if (!file) {
      setFormError('Elige una imagen de tu galería.')
      return
    }
    let lat: number
    let lon: number
    if (locMode === 'gps') {
      if (!user) {
        setFormError('Activa GPS o elige coordenadas manuales.')
        return
      }
      lat = user.lat
      lon = user.lon
    } else {
      lat = Number(manualLat)
      lon = Number(manualLon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setFormError('Latitud y longitud inválidas.')
        return
      }
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        setFormError('Coordenadas fuera de rango.')
        return
      }
    }
    const yearNum = year.trim() ? Number(year) : null
    if (yearNum != null && (!Number.isFinite(yearNum) || yearNum < 1800)) {
      setFormError('Año inválido.')
      return
    }

    setSaving(true)
    try {
      const saved = await saveUserPhoto({
        title,
        lat,
        lon,
        year: yearNum,
        file,
      })
      await refreshMine()
      setShowAdd(false)
      setTitle('')
      setYear('')
      setFile(null)
      mapRef.current?.flyTo([saved.lat, saved.lon], 16, { duration: 0.7 })
    } catch {
      setFormError('No se pudo guardar en este dispositivo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="shell places">
      <div className="places-map" ref={mapEl} />

      <div className="places-top">
        <button type="button" className="btn-ghost" onClick={onBack}>
          AyerAquí
        </button>
        <div className="places-top-actions">
          <button
            type="button"
            className="btn-mini link"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? 'Cerrar' : 'Agregar mi foto'}
          </button>
          <button
            type="button"
            className="btn-mini link"
            onClick={onLocate}
            disabled={locating}
          >
            {locating ? 'Ubicando…' : user ? 'Actualizar GPS' : 'Usar mi ubicación'}
          </button>
        </div>
      </div>

      <div className="places-panel">
        <header className="places-head">
          <h1>Mapa de lugares</h1>
          <p>
            Abre un punto en la cámara o guarda tu propia foto con ubicación en
            este celular.
          </p>
          {nearbyStatus && <p className="places-status">{nearbyStatus}</p>}
        </header>

        {showAdd && (
          <div className="add-photo-form">
            <h2>Agregar mi foto</h2>
            <label>
              Título
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Mi calle en los 80"
              />
            </label>
            <label>
              Año (opcional)
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                inputMode="numeric"
                placeholder="1985"
              />
            </label>
            <label>
              Imagen
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="loc-mode">
              <button
                type="button"
                className={locMode === 'gps' ? 'is-active' : ''}
                onClick={() => setLocMode('gps')}
              >
                Usar mi GPS
              </button>
              <button
                type="button"
                className={locMode === 'manual' ? 'is-active' : ''}
                onClick={() => setLocMode('manual')}
              >
                Coordenadas
              </button>
            </div>
            {locMode === 'manual' ? (
              <div className="coord-row">
                <label>
                  Lat
                  <input
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    placeholder="19.43260"
                  />
                </label>
                <label>
                  Lon
                  <input
                    value={manualLon}
                    onChange={(e) => setManualLon(e.target.value)}
                    placeholder="-99.13320"
                  />
                </label>
              </div>
            ) : (
              <p className="place-meta">
                {user
                  ? `GPS actual: ${user.lat.toFixed(5)}, ${user.lon.toFixed(5)}`
                  : 'Pulsa “Usar mi ubicación” arriba para obtener GPS.'}
              </p>
            )}
            {formError && <p className="banner-error">{formError}</p>}
            <button
              type="button"
              className="btn-primary place-open"
              disabled={saving}
              onClick={() => void onSaveMine()}
            >
              {saving ? 'Guardando…' : 'Guardar en este celular'}
            </button>
          </div>
        )}

        {selected && (
          <div className="place-card selected">
            <p className="place-kicker">
              {selected.kind === 'curated' ? 'Curado en AyerAquí' : 'Hotspot Commons'}{' '}
              · {selected.decadeHint}
            </p>
            <h2>{selected.name}</h2>
            <p>
              {selected.city}, {selected.country}
            </p>
            <p>{selected.blurb}</p>
            <p className="place-meta">
              {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
              {user
                ? ` · a ${formatDistance(
                    placesWithDistance(user).find((p) => p.id === selected.id)
                      ?.distanceM ?? 0,
                  )}`
                : ''}
            </p>
            <div className="place-card-actions">
              {onOpenPlaceCamera && (
                <button
                  type="button"
                  className="btn-primary place-open"
                  onClick={() =>
                    onOpenPlaceCamera({
                      lat: selected.lat,
                      lon: selected.lon,
                      name: selected.name,
                    })
                  }
                >
                  Abrir en cámara
                </button>
              )}
              {selected.kind === 'curated' &&
                selected.curatedId &&
                onOpenCurated && (
                  <button
                    type="button"
                    className="btn-secondary place-open"
                    onClick={() => onOpenCurated(selected.curatedId!)}
                  >
                    Ver foto curada
                  </button>
                )}
            </div>
          </div>
        )}

        {mine.length > 0 && (
          <div className="mine-list">
            <h3>Mis fotos en este celular</h3>
            {mine.map((photo) => (
              <div key={photo.id} className="mine-row">
                <img src={objectUrlFor(photo)} alt="" />
                <div className="mine-row-text">
                  <strong>{photo.title}</strong>
                  <small>
                    {photo.lat.toFixed(4)}, {photo.lon.toFixed(4)}
                    {photo.year ? ` · ${photo.year}` : ''}
                  </small>
                </div>
                <div className="mine-row-actions">
                  {onOpenUserPhoto && (
                    <button
                      type="button"
                      className="btn-mini link"
                      onClick={() => onOpenUserPhoto(photo.id)}
                    >
                      Cámara
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => {
                      void deleteUserPhoto(photo.id).then(() => refreshMine())
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="places-list">
          {ranked.map((place) => (
            <button
              key={place.id}
              type="button"
              className={`place-row ${selected?.id === place.id ? 'is-active' : ''}`}
              onClick={() => focusPlace(place)}
            >
              <span
                className={`place-dot ${place.kind === 'curated' ? 'curated' : 'hotspot'}`}
              />
              <span className="place-row-text">
                <strong>{place.name}</strong>
                <small>
                  {place.city} · {place.decadeHint}
                  {place.distanceM != null
                    ? ` · ${formatDistance(place.distanceM)}`
                    : ''}
                </small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
