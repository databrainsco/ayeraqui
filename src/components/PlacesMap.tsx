import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { placesWithDistance, type MapPlace } from '../lib/places'
import { formatDistance, type GeoPosition } from '../lib/geolocation'
import { fetchHistoricPhotosNearby, type HistoricPhoto } from '../lib/commonsApi'

type Props = {
  user: GeoPosition | null
  onBack: () => void
  onLocate: () => void
  onOpenCurated?: (curatedId: string) => void
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
  locating,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [selected, setSelected] = useState<MapPlace | null>(null)
  const [nearby, setNearby] = useState<HistoricPhoto[]>([])
  const [nearbyStatus, setNearbyStatus] = useState<string | null>(null)

  const ranked = useMemo(() => placesWithDistance(user), [user])
  const didCenterOnUser = useRef(false)

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
      attribution:
        '&copy; OpenStreetMap &copy; CARTO',
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
  }, [ranked, nearby, user])

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

  return (
    <div className="shell places">
      <div className="places-map" ref={mapEl} />

      <div className="places-top">
        <button type="button" className="btn-ghost" onClick={onBack}>
          AyerAquí
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

      <div className="places-panel">
        <header className="places-head">
          <h1>Mapa de lugares</h1>
          <p>
            Puntos curados y hotspots donde Commons suele tener fotos
            geotagueadas. La app funciona en todo el mundo por GPS.
          </p>
          {nearbyStatus && <p className="places-status">{nearbyStatus}</p>}
        </header>

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
              {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)} · punto ~{' '}
              {selected.matchRadiusM} m
              {user
                ? ` · a ${formatDistance(
                    placesWithDistance(user).find((p) => p.id === selected.id)
                      ?.distanceM ?? 0,
                  )}`
                : ''}
            </p>
            {selected.kind === 'curated' && selected.curatedId && onOpenCurated && (
              <button
                type="button"
                className="btn-primary place-open"
                onClick={() => onOpenCurated(selected.curatedId!)}
              >
                Ver foto ahora
              </button>
            )}
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
