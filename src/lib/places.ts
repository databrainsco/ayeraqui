import { distanceMeters } from './geolocation'

export type PlaceKind = 'curated' | 'commons-hotspot'

export type MapPlace = {
  id: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
  decadeHint: string
  blurb: string
  kind: PlaceKind
  /** Radio sugerido para activar overlay in situ */
  matchRadiusM: number
  curatedId?: string
}

/**
 * Catálogo de puntos recomendados (mapa).
 * - curated: tenemos foto propia en la app
 * - commons-hotspot: conviene ir; Commons suele tener fotos geotagueadas ahí
 */
export const MAP_PLACES: MapPlace[] = [
  {
    id: 'unam-rectoria',
    name: 'Rectoría UNAM — mural de Siqueiros',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.33192,
    lon: -99.18728,
    decadeHint: '1950s',
    blurb: 'Plaza poniente de Rectoría. Foto curada del montaje de las escultopinturas.',
    kind: 'curated',
    matchRadiusM: 90,
    curatedId: 'unam-rectoria-siqueiros-1950s',
  },
  {
    id: 'zocalo-cdmx',
    name: 'Zócalo / Catedral Metropolitana',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.43260,
    lon: -99.13320,
    decadeHint: 'varios',
    blurb: 'Plaza principal; muchas fotos históricas geotagueadas en Commons.',
    kind: 'commons-hotspot',
    matchRadiusM: 120,
  },
  {
    id: 'bellas-artes',
    name: 'Palacio de Bellas Artes',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.43520,
    lon: -99.14120,
    decadeHint: '1930s–',
    blurb: 'Fachada y entorno del Centro Histórico con amplio archivo visual.',
    kind: 'commons-hotspot',
    matchRadiusM: 100,
  },
  {
    id: 'chapultepec',
    name: 'Castillo de Chapultepec',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.42044,
    lon: -99.18194,
    decadeHint: 'varios',
    blurb: 'Miradores y fachadas del castillo con fotos de distintas décadas.',
    kind: 'commons-hotspot',
    matchRadiusM: 120,
  },
  {
    id: 'templo-mayor',
    name: 'Templo Mayor',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.43460,
    lon: -99.13190,
    decadeHint: 'excavación / archivo',
    blurb: 'Zona arqueológica junto al Zócalo; buen punto para comparar vistas.',
    kind: 'commons-hotspot',
    matchRadiusM: 100,
  },
  {
    id: 'torre-latino',
    name: 'Torre Latinoamericana',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.43390,
    lon: -99.14060,
    decadeHint: '1950s–',
    blurb: 'Ícono moderno del Centro; fotos de construcción y skyline.',
    kind: 'commons-hotspot',
    matchRadiusM: 100,
  },
  {
    id: 'angel-independencia',
    name: 'Ángel de la Independencia',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.42700,
    lon: -99.16770,
    decadeHint: '1910s–',
    blurb: 'Paseo de la Reforma; monumento con muchas tomas de archivo.',
    kind: 'commons-hotspot',
    matchRadiusM: 90,
  },
  {
    id: 'basilica-guadalupe',
    name: 'Basílica de Guadalupe',
    city: 'Ciudad de México',
    country: 'México',
    lat: 19.48490,
    lon: -99.11750,
    decadeHint: 'varios',
    blurb: 'Atrio y basílicas vieja/nueva; fuerte presencia en archivos.',
    kind: 'commons-hotspot',
    matchRadiusM: 150,
  },
  {
    id: 'eiffel',
    name: 'Tour Eiffel',
    city: 'París',
    country: 'Francia',
    lat: 48.85837,
    lon: 2.29448,
    decadeHint: '1880s–',
    blurb: 'Uno de los puntos con más fotos históricas geotagueadas del mundo.',
    kind: 'commons-hotspot',
    matchRadiusM: 150,
  },
  {
    id: 'colosseum',
    name: 'Coliseo',
    city: 'Roma',
    country: 'Italia',
    lat: 41.89020,
    lon: 12.49220,
    decadeHint: 'varios',
    blurb: 'Monumento con cobertura masiva en Wikimedia Commons.',
    kind: 'commons-hotspot',
    matchRadiusM: 150,
  },
  {
    id: 'big-ben',
    name: 'Elizabeth Tower (Big Ben)',
    city: 'Londres',
    country: 'Reino Unido',
    lat: 51.50070,
    lon: -0.12460,
    decadeHint: 'varios',
    blurb: 'Parliament Square — muchas vistas de archivo cercanas.',
    kind: 'commons-hotspot',
    matchRadiusM: 120,
  },
  {
    id: 'statue-liberty',
    name: 'Estatua de la Libertad',
    city: 'Nueva York',
    country: 'EE. UU.',
    lat: 40.68920,
    lon: -74.04450,
    decadeHint: '1880s–',
    blurb: 'Liberty Island; fotos históricas y turísticas geotagueadas.',
    kind: 'commons-hotspot',
    matchRadiusM: 200,
  },
]

export function placesWithDistance(user?: { lat: number; lon: number } | null) {
  return MAP_PLACES.map((place) => ({
    ...place,
    distanceM: user
      ? distanceMeters(user, { lat: place.lat, lon: place.lon })
      : null,
  })).sort((a, b) => {
    if (a.distanceM == null && b.distanceM == null) return a.name.localeCompare(b.name)
    if (a.distanceM == null) return 1
    if (b.distanceM == null) return -1
    return a.distanceM - b.distanceM
  })
}
