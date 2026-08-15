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
    return new GeoError(
      'denied',
      'Activa la ubicación (Ajustes → Safari/Chrome → Ubicación) para ver el antes de este lugar.',
    )
  }
  if (err.code === err.TIMEOUT) {
    return new GeoError(
      'timeout',
      'No pudimos obtener tu ubicación a tiempo. En datos móviles tarda más: inténtalo de nuevo o usa el mapa.',
    )
  }
  return new GeoError('unavailable', 'La ubicación no está disponible ahora.')
}

function requestPosition(options: PositionOptions): Promise<GeoPosition> {
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
      options,
    )
  })
}

/**
 * En iPhone y datos móviles, GPS de alta precisión suele hacer timeout.
 * Primero un fix rápido (red/Wi‑Fi), luego se intenta más preciso.
 */
export async function getCurrentPosition(): Promise<GeoPosition> {
  try {
    return await requestPosition({
      enableHighAccuracy: false,
      timeout: 12_000,
      maximumAge: 60_000,
    })
  } catch (first) {
    if (first instanceof GeoError && first.kind === 'denied') throw first
    try {
      return await requestPosition({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 15_000,
      })
    } catch {
      throw first
    }
  }
}

export function watchPosition(
  onUpdate: (pos: GeoPosition) => void,
  onError?: (err: GeoError) => void,
): () => void {
  if (!('geolocation' in navigator)) {
    onError?.(
      new GeoError('unsupported', 'Este dispositivo no soporta geolocalización.'),
    )
    return () => undefined
  }

  // Sin timeout: en iOS un timeout en watchPosition aborta el seguimiento.
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      })
    },
    (err) => {
      if (err.code === err.TIMEOUT) return
      onError?.(mapError(err))
    },
    {
      enableHighAccuracy: false,
      maximumAge: 15_000,
    },
  )

  return () => navigator.geolocation.clearWatch(id)
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
