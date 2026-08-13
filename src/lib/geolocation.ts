export type GeoPosition = {
  lat: number
  lon: number
  accuracy: number
}

export type GeoErrorKind = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export class GeoError extends Error {
  kind: GeoErrorKind

  constructor(kind: GeoErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

function mapError(err: GeolocationPositionError): GeoError {
  if (err.code === err.PERMISSION_DENIED) {
    return new GeoError('denied', 'Activa la ubicación para ver el antes de este lugar.')
  }
  if (err.code === err.TIMEOUT) {
    return new GeoError('timeout', 'No pudimos obtener tu ubicación a tiempo.')
  }
  return new GeoError('unavailable', 'La ubicación no está disponible ahora.')
}

export function getCurrentPosition(): Promise<GeoPosition> {
  if (!('geolocation' in navigator)) {
    return Promise.reject(
      new GeoError('unsupported', 'Este dispositivo no soporta geolocalización.'),
    )
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => reject(mapError(err)),
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 30_000,
      },
    )
  })
}

/** Haversine distance in meters */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
