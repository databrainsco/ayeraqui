import { distanceMeters } from './geolocation'
import { curatedNearby } from './curated'
import { loadUserHistoricPhotos } from './userPhotos'

const API = 'https://commons.wikimedia.org/w/api.php'

export type HistoricPhoto = {
  pageId: number
  title: string
  thumbUrl: string
  fullUrl: string
  lat: number
  lon: number
  distanceM: number
  year: number | null
  decade: number | null
  artist: string | null
  license: string | null
  descriptionUrl: string
  place?: string | null
  work?: string | null
  context?: string | null
  credit?: string | null
  curated?: boolean
  matchRadiusM?: number
  align?: { scale: number; x: number; y: number }
}

export type DecadeGroup = {
  decade: number | null
  label: string
  photos: HistoricPhoto[]
}

type GeoSearchItem = {
  pageid: number
  title: string
  lat: number
  lon: number
  dist: number
}

type ExtMeta = Record<string, { value?: string } | undefined>

function yearFromText(text: string | undefined | null): number | null {
  if (!text) return null
  const matches = text.match(/\b(18|19|20)\d{2}\b/g)
  if (!matches) return null
  const years = matches
    .map((y) => Number(y))
    .filter((y) => y >= 1800 && y <= new Date().getFullYear())
  if (!years.length) return null
  return Math.min(...years)
}

function decadeOf(year: number | null): number | null {
  if (year == null) return null
  return Math.floor(year / 10) * 10
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function api<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API)
  Object.entries({ format: 'json', origin: '*', ...params }).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  )
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Commons API ${res.status}`)
  return res.json() as Promise<T>
}

async function geoSearch(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<GeoSearchItem[]> {
  const data = await api<{
    query?: { geosearch?: GeoSearchItem[] }
  }>({
    action: 'query',
    list: 'geosearch',
    gscoord: `${lat}|${lon}`,
    gsradius: String(Math.min(radiusM, 10000)),
    gslimit: '40',
    gsnamespace: '6',
  })
  return data.query?.geosearch ?? []
}

async function enrichPages(
  items: GeoSearchItem[],
  user: { lat: number; lon: number },
): Promise<HistoricPhoto[]> {
  if (!items.length) return []

  const titles = items.map((i) => i.title).join('|')
  const data = await api<{
    query?: {
      pages?: Record<
        string,
        {
          pageid: number
          title: string
          imageinfo?: Array<{
            url: string
            thumburl?: string
            descriptionurl: string
            extmetadata?: ExtMeta
          }>
          coordinates?: Array<{ lat: number; lon: number }>
        }
      >
    }
  }>({
    action: 'query',
    prop: 'imageinfo|coordinates',
    titles,
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '1280',
    coprop: 'type|name|dim',
    colimit: '40',
  })

  const byTitle = new Map(items.map((i) => [i.title, i]))
  const pages = Object.values(data.query?.pages ?? {})
  const photos: HistoricPhoto[] = []

  for (const page of pages) {
    const info = page.imageinfo?.[0]
    if (!info?.url) continue
    const titleLower = page.title.toLowerCase()
    if (
      titleLower.endsWith('.svg') ||
      titleLower.endsWith('.pdf') ||
      titleLower.endsWith('.djvu') ||
      titleLower.includes('icon') ||
      titleLower.includes('logo')
    ) {
      continue
    }

    const meta = info.extmetadata ?? {}
    const dateRaw =
      meta.DateTimeOriginal?.value ||
      meta.DateTime?.value ||
      meta.DateTimeMetadata?.value ||
      meta.ImageDescription?.value ||
      page.title

    const year =
      yearFromText(stripHtml(String(dateRaw))) ??
      yearFromText(page.title) ??
      yearFromText(stripHtml(meta.ObjectName?.value ?? ''))

    const geo = byTitle.get(page.title)
    const lat = page.coordinates?.[0]?.lat ?? geo?.lat
    const lon = page.coordinates?.[0]?.lon ?? geo?.lon
    if (lat == null || lon == null) continue

    const artist = meta.Artist?.value ? stripHtml(meta.Artist.value) : null
    const license = meta.LicenseShortName?.value
      ? stripHtml(meta.LicenseShortName.value)
      : null

    photos.push({
      pageId: page.pageid,
      title: page.title.replace(/^File:/, ''),
      thumbUrl: info.thumburl || info.url,
      fullUrl: info.url,
      lat,
      lon,
      distanceM: distanceMeters(user, { lat, lon }),
      year,
      decade: decadeOf(year),
      artist,
      license,
      descriptionUrl: info.descriptionurl,
    })
  }

  return photos.sort((a, b) => a.distanceM - b.distanceM)
}

function mergePhotos(
  curated: HistoricPhoto[],
  userOwned: HistoricPhoto[],
  remote: HistoricPhoto[],
): HistoricPhoto[] {
  const seen = new Set<string>()
  const out: HistoricPhoto[] = []
  for (const photo of [...userOwned, ...curated, ...remote]) {
    const key = `${photo.pageId}:${photo.fullUrl}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(photo)
  }
  return out
}

export async function fetchHistoricPhotosNearby(
  lat: number,
  lon: number,
  radiusM = 500,
): Promise<HistoricPhoto[]> {
  const user = { lat, lon }
  const [curated, userOwned, hits] = await Promise.all([
    Promise.resolve(curatedNearby(user, radiusM)),
    loadUserHistoricPhotos(user),
    geoSearch(lat, lon, radiusM),
  ])
  const remote = await enrichPages(hits, user)
  const remoteInRadius = remote.filter((p) => p.distanceM <= radiusM)
  // Curated + fotos del usuario: siempre disponibles; Commons solo cerca.
  return mergePhotos(curated, userOwned, remoteInRadius)
}

function sortPhotos(photos: HistoricPhoto[]): HistoricPhoto[] {
  return [...photos].sort((a, b) => {
    if (a.curated && !b.curated) return -1
    if (!a.curated && b.curated) return 1
    return a.distanceM - b.distanceM
  })
}

export function groupByDecade(photos: HistoricPhoto[]): DecadeGroup[] {
  const map = new Map<number | null, HistoricPhoto[]>()
  for (const photo of photos) {
    const key = photo.decade
    const list = map.get(key) ?? []
    list.push(photo)
    map.set(key, list)
  }

  const decades = [...map.keys()].sort((a, b) => {
    if (a == null) return 1
    if (b == null) return -1
    return a - b
  })

  return decades.map((decade) => ({
    decade,
    label: decade == null ? 'Sin fecha' : `${decade}s`,
    photos: sortPhotos(map.get(decade) ?? []),
  }))
}
