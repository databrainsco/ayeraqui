import { distanceMeters } from './geolocation'
import type { HistoricPhoto } from './commonsApi'

const asset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

/** Seed photos with rich metadata (shown first when nearby, or via ejemplo). */
export type CuratedSeed = {
  id: string
  title: string
  lat: number
  lon: number
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
}

export const CURATED_SEEDS: CuratedSeed[] = [
  {
    id: 'unam-rectoria-siqueiros-1950s',
    title: 'Rectoría UNAM — montaje del mural de Siqueiros',
    lat: 19.33205,
    lon: -99.18695,
    year: 1954,
    decade: 1950,
    artist: 'David Alfaro Siqueiros',
    place: 'Edificio de Rectoría, Ciudad Universitaria (UNAM), Ciudad de México',
    work: 'Mural «Las fechas en la historia de México o el derecho a la cultura»',
    context:
      'Fotografía de la década de 1950 (entre 1952 y 1956). Se aprecia el proceso de creación y montaje de las escultopinturas sobre el volumen poniente de la Rectoría durante la construcción del campus central.',
    credit: 'Fotografía IISUE-AHUNAM Colección Universidad Doc. 3402',
    license: 'Archivo histórico',
    imagePath: 'curated/unam-rectoria-siqueiros-1950s.png',
    sourceUrl: 'https://www.unam.mx/',
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
  }
}

export function curatedNearby(
  user: { lat: number; lon: number },
  radiusM: number,
): HistoricPhoto[] {
  return CURATED_SEEDS.map((seed) => curatedToPhoto(seed, user))
    .filter((p) => p.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
}

/** Primer ejemplo destacado (siempre disponible para demo). */
export function featuredExample(
  user?: { lat: number; lon: number } | null,
): HistoricPhoto {
  const seed = CURATED_SEEDS[0]
  const ref = user ?? { lat: seed.lat, lon: seed.lon }
  return curatedToPhoto(seed, ref)
}
