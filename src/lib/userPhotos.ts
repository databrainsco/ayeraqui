import { distanceMeters } from './geolocation'
import type { HistoricPhoto } from './commonsApi'

const DB_NAME = 'ayeraqui-user-photos'
const DB_VERSION = 1
const STORE = 'photos'

export type UserPhotoRecord = {
  id: string
  title: string
  lat: number
  lon: number
  year: number | null
  blob: Blob
  createdAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'))
  })
}

export async function listUserPhotos(): Promise<UserPhotoRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const rows = (req.result as UserPhotoRecord[]).sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      resolve(rows)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function saveUserPhoto(input: {
  title: string
  lat: number
  lon: number
  year: number | null
  file: Blob
}): Promise<UserPhotoRecord> {
  const record: UserPhotoRecord = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim() || 'Mi foto',
    lat: input.lat,
    lon: input.lon,
    year: input.year,
    blob: input.file,
    createdAt: Date.now(),
  }
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(record)
  await txDone(tx)
  return record
}

export async function deleteUserPhoto(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await txDone(tx)
}

const objectUrls = new Map<string, string>()

export function objectUrlFor(record: UserPhotoRecord): string {
  const existing = objectUrls.get(record.id)
  if (existing) return existing
  const url = URL.createObjectURL(record.blob)
  objectUrls.set(record.id, url)
  return url
}

export function userRecordToHistoric(
  record: UserPhotoRecord,
  user: { lat: number; lon: number },
): HistoricPhoto {
  const url = objectUrlFor(record)
  const decade =
    record.year != null ? Math.floor(record.year / 10) * 10 : null
  const pageId = -Math.abs(
    [...record.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
  )
  return {
    pageId,
    title: record.title,
    thumbUrl: url,
    fullUrl: url,
    lat: record.lat,
    lon: record.lon,
    distanceM: distanceMeters(user, { lat: record.lat, lon: record.lon }),
    year: record.year,
    decade,
    artist: 'Tú',
    license: 'Local (este dispositivo)',
    descriptionUrl: '#',
    place: `${record.lat.toFixed(5)}, ${record.lon.toFixed(5)}`,
    work: null,
    context: 'Foto guardada en este celular dentro de AyerAquí.',
    credit: 'Almacenada localmente (IndexedDB)',
    curated: true,
    matchRadiusM: 120,
  }
}

/** Incluye fotos del usuario siempre (para mapa/cámara); distancia según user. */
export async function loadUserHistoricPhotos(user: {
  lat: number
  lon: number
}): Promise<HistoricPhoto[]> {
  const rows = await listUserPhotos()
  return rows
    .map((r) => userRecordToHistoric(r, user))
    .sort((a, b) => a.distanceM - b.distanceM)
}

export async function loadUserHistoricNearby(
  user: { lat: number; lon: number },
  radiusM: number,
): Promise<HistoricPhoto[]> {
  const all = await loadUserHistoricPhotos(user)
  return all.filter((p) => p.distanceM <= radiusM)
}
