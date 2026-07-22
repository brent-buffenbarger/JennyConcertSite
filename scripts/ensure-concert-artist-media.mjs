import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(projectRoot, 'frontend/src/data/concert-media.json')
const requestedArtists = process.argv[2] ? JSON.parse(process.argv[2]) : []

function normalizeLookupKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value) {
  return normalizeLookupKey(value).replace(/\s+/g, '-')
}

async function searchDeezerArtist(artist) {
  const url = new URL('https://api.deezer.com/search/artist')
  url.searchParams.set('q', artist)
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Deezer returned HTTP ${response.status}`)
  const payload = await response.json()
  return (payload.data || [])
    .filter((candidate) => normalizeLookupKey(candidate.name) === normalizeLookupKey(artist))
    .filter((candidate) => candidate.picture_xl && !candidate.picture_xl.includes('d41d8cd98f00b204e9800998ecf8427e'))
    .sort((left, right) => (right.nb_fan || 0) - (left.nb_fan || 0) || (right.nb_album || 0) - (left.nb_album || 0))[0] || null
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const coveredNames = new Set(manifest.artists.flatMap((record) => record.names.map(normalizeLookupKey)))
const artists = [...new Map(requestedArtists
  .map((artist) => String(artist || '').trim())
  .filter(Boolean)
  .map((artist) => [normalizeLookupKey(artist), artist])).values()]
const added = []
const missing = []

for (const artist of artists) {
  if (coveredNames.has(normalizeLookupKey(artist))) continue
  try {
    const candidate = await searchDeezerArtist(artist)
    if (!candidate) {
      missing.push(artist)
      continue
    }
    manifest.artists.push({
      key: slugify(artist),
      names: [artist],
      title: `${artist} artist profile image`,
      imageUrl: candidate.picture_xl,
      width: 1000,
      height: 1000,
      sourceUrl: candidate.link,
      originalUrl: candidate.picture_xl,
      sourceSha1: null,
      localSha256: null,
      creator: artist,
      licenseName: 'Image via Deezer',
      licenseUrl: 'https://developers.deezer.com/termsofuse',
      creditText: `${artist} artist profile / Deezer`,
      modifications: 'Displayed remotely and cropped for card display',
      provider: 'Deezer',
      providerId: candidate.id,
      rightsClass: 'provider-promotional',
    })
    coveredNames.add(normalizeLookupKey(artist))
    added.push(artist)
  } catch (error) {
    missing.push(artist)
    process.stderr.write(`Could not resolve media for ${artist}: ${error.message}\n`)
  }
}

if (added.length) {
  manifest.generatedAt = new Date().toISOString()
  await mkdir(dirname(manifestPath), { recursive: true })
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, manifestPath)
}

process.stdout.write(`${JSON.stringify({ added, missing })}\n`)
