import { distanceMeters } from './geolocation'
import type { HistoricPhoto } from './commonsApi'

const asset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

/**
 * Fotos curadas con punto de vista preciso.
 * Solo aparecen si el usuario está dentro de matchRadiusM del lat/lon.
 */
export type CuratedSeed = {
  id: string
  title: string
  /** Punto de vista aproximado desde donde se tomó / se alinea la foto */
  lat: number
  lon: number
  /** Radio estricto (metros) para activar esta foto */
  matchRadiusM: number
  year: number
  decade: number
  artist: string
  place: string
  work: string
  context: string
  credit: string
  license: string
  imagePath: string
  sourceUrl: string
  /** Encuadre sugerido para alinear con la cámara */
  align?: { scale: number; x: number; y: number }
}

export const CURATED_SEEDS: CuratedSeed[] = [
  {
    id: 'unam-rectoria-siqueiros-1950s',
    title: 'Rectoría UNAM — montaje del mural de Siqueiros',
    // Plaza poniente de Rectoría, mirando al volumen del mural (escultopintura)
    lat: 19.33192,
    lon: -99.18728,
    matchRadiusM: 90,
    year: 1954,
    decade: 1950,
    artist: 'David Alfaro Siqueiros',
    place:
      'Edificio de Rectoría (fachada poniente), Ciudad Universitaria UNAM, CDMX',
    work: 'Mural «Las fechas en la historia de México o el derecho a la cultura»',
    context:
      'Fotografía de la década de 1950 (entre 1952 y 1956). Se aprecia el proceso de creación y montaje de las escultopinturas sobre el volumen poniente de la Rectoría durante la construcción del campus central.',
    credit: 'Fotografía IISUE-AHUNAM Colección Universidad Doc. 3402',
    license: 'Archivo histórico',
    imagePath: 'curated/unam-rectoria-siqueiros-1950s.png',
    sourceUrl: 'https://www.unam.mx/',
    align: { scale: 1, x: 0, y: 0 },
  },
]

export function curatedToPhoto(
  seed: CuratedSeed,
  user: { lat: number; lon: number },
): HistoricPhoto {
  const url = asset(seed.imagePath)
  return {
    pageId: -Math.abs(
      [...seed.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
    ),
    title: seed.title,
    thumbUrl: url,
    fullUrl: url,
    lat: seed.lat,
    lon: seed.lon,
    distanceM: distanceMeters(user, { lat: seed.lat, lon: seed.lon }),
    year: seed.year,
    decade: seed.decade,
    artist: seed.artist,
    license: seed.license,
    descriptionUrl: seed.sourceUrl,
    place: seed.place,
    work: seed.work,
    context: seed.context,
    credit: seed.credit,
    curated: true,
    matchRadiusM: seed.matchRadiusM,
    align: seed.align,
  }
}

/** Solo si estás dentro del radio del punto de vista (no “todo México”). */
export function curatedNearby(
  user: { lat: number; lon: number },
  searchRadiusM: number,
): HistoricPhoto[] {
  return CURATED_SEEDS.map((seed) => curatedToPhoto(seed, user))
    .filter((p) => {
      const limit = Math.min(searchRadiusM, p.matchRadiusM ?? 80)
      return p.distanceM <= limit
    })
    .sort((a, b) => a.distanceM - b.distanceM)
}

export function featuredHeroUrl(): string {
  return asset(CURATED_SEEDS[0].imagePath)
}

export function nearestCuratedHint(user: {
  lat: number
  lon: number
}): { title: string; distanceM: number; matchRadiusM: number } | null {
  if (!CURATED_SEEDS.length) return null
  const ranked = CURATED_SEEDS.map((seed) => ({
    title: seed.title,
    distanceM: distanceMeters(user, { lat: seed.lat, lon: seed.lon }),
    matchRadiusM: seed.matchRadiusM,
  })).sort((a, b) => a.distanceM - b.distanceM)
  return ranked[0] ?? null
}
