import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = resolve(projectRoot, 'frontend/public/media')
const manifestPath = resolve(projectRoot, 'frontend/src/data/concert-media.json')
const catalogPath = resolve(projectRoot, 'data/notes/concerts.catalog.json')
const userAgent = 'JennyConcertWebsite/1.0 (personal project media attribution; Wikimedia Commons sources retained)'

const sources = [
  { kind: 'artist', key: 'post-malone', names: ['Post Malone'], commonsTitle: 'File:Post Malone July 2021 (cropped).jpg' },
  { kind: 'artist', key: 'jon-bellion', names: ['Jon Belion', 'Jon Bellion'], commonsTitle: 'File:Jon Bellion live in Long Island, New York 2019.jpg' },
  { kind: 'artist', key: 'red-hot-chili-peppers', names: ['Red Hot Chili Peppers', 'RHCP'], commonsTitle: 'File:RHCP Live in London 26 June 2022.jpg' },
  { kind: 'artist', key: 'weezer', names: ['Weezer'], commonsTitle: 'File:Weezer Bethlehem 2019 1.jpg' },
  { kind: 'artist', key: 'imagine-dragons', names: ['Imagine Dragons'], commonsTitle: 'File:Imagine Dragons, Roundhouse, London (35390234536).jpg' },
  { kind: 'artist', key: 'maneskin', names: ['Maneskin', 'Måneskin'], commonsTitle: 'File:Maneskin 2018.jpg' },
  { kind: 'artist', key: 'noah-kahan', names: ['Noah Kahan'], commonsTitle: 'File:Noah Kahan at Glastonbury Festival 2025 04 (cropped).jpg' },
  { kind: 'artist', key: 'cage-the-elephant', names: ['Cage the Elephant'], commonsTitle: 'File:Cage the elephant.jpg', creator: 'Coxy' },
  { kind: 'artist', key: 'snoop-dogg', names: ['Snoop Dogg'], commonsTitle: 'File:Snoop Dogg 2023 (53775197331) (cropped) (cropped).jpg' },
  { kind: 'artist', key: 'smashing-pumpkins', names: ['Smashing Pumpkins', 'The Smashing Pumpkins'], commonsTitle: 'File:Smashing Pumpkins den Atelier,Luxembourg.JPG' },
  { kind: 'artist', key: 'glass-animals', names: ['Glass Animals', 'Glass animals'], commonsTitle: 'File:Glass Animals - Brooklyn Mirage 2022 07 (cropped).jpg' },
  { kind: 'artist', key: 'miley-cyrus', names: ['Miley Cyrus'], commonsTitle: 'File:Miley Cyrus Primavera19 -226 (48986293772) (cropped).jpg' },
  { kind: 'artist', key: 'kanye-west', names: ['Kanye West'], commonsTitle: 'File:Kanye West at the 2009 Tribeca Film Festival (crop 2).jpg' },
  { kind: 'artist', key: 'eminem', names: ['Eminem'], commonsTitle: 'File:Eminem performing at Lollapalooza2011.jpg' },
  { kind: 'artist', key: 'lil-nas-x', names: ['Lil Nas X'], commonsTitle: 'File:Lil Nas X back stage at the MTV Video Music Awards 2019.jpg' },
  { kind: 'venue', key: 'hollywood-bowl', names: ['Hollywood Bowl'], commonsTitle: 'File:Night scene, Hollywood Bowl, Hollywood, California (63796).jpg' },
  { kind: 'venue', key: 'kia-forum', names: ['Kia Forum', 'Kia'], commonsTitle: 'File:Inglewood Forum at night.jpg' },
  { kind: 'venue', key: 'greek-theatre', names: ['Greek Theatre'], commonsTitle: 'File:Greek Theatre Los Angeles 2019.jpg' },
  { kind: 'venue', key: 'hollywood-palladium', names: ['Hollywood Palladium'], commonsTitle: 'File:Hollywood Palladium 2012.jpg' },
  { kind: 'venue', key: 'sofi-stadium', names: ['SoFi Stadium'], commonsTitle: 'File:SoFi Stadium 2023.jpg' },
  { kind: 'venue', key: 'the-belasco', names: ['The Belasco'], commonsTitle: 'File:Belasco Theater (14170156755).jpg' },
  { kind: 'venue', key: 'the-roxy-theatre', names: ['The Roxy Theatre', 'The Roxy'], commonsTitle: 'File:Roxy Theatre.jpg' },
  { kind: 'venue', key: 'youtube-theater', names: ['YouTube Theater'], commonsTitle: 'File:YouTube Theater interior.jpg' },
  { kind: 'venue', key: 'hollywood-forever-cemetery', names: ['Hollywood Forever Cemetery'], commonsTitle: 'File:Hollywood Forever Cemetery Main Building.JPG' },
  { kind: 'venue', key: 'echoplex', names: ['Echoplex'], commonsTitle: 'File:Echoplex, Los Angeles, United States (Unsplash).jpg' },
  { kind: 'venue', key: 'pacific-amphitheatre', names: ['Pacific Amphitheatre'], commonsTitle: 'File:Pacific Amphitheatre.jpg' },
  { kind: 'venue', key: 'hollywood-casino-amphitheatre', names: ['Hollywood Casino Amphitheatre'], commonsTitle: 'File:Hollywood Casino Amphitheatre.jpg' },
  { kind: 'venue', key: 'usana-amphitheatre', names: ['USANA Amphitheatre'], commonsTitle: 'File:USANA Amphitheatre (28949134767).jpg' },
  { kind: 'venue', key: 'gallivan-center', names: ['Gallivan Center'], commonsTitle: 'File:Gallivan Center.jpg' },
  { kind: 'venue', key: 'tao-beach-dayclub', names: ['TAO Beach Dayclub'], commonsTitle: 'File:Tao Beach, Las Vegas.jpg' },
]

const artistDisplayNames = {
  'alanis morisette': 'Alanis Morissette',
  'g eazy': 'G-Eazy',
  'glass animals': 'Glass Animals',
  'good neighbors': 'Good Neighbours',
  'jon belion': 'Jon Bellion',
  maneskin: 'Måneskin',
  'one republic': 'OneRepublic',
}

function metadataValue(metadata, key) {
  return metadata?.[key]?.value || ''
}

function normalizeLookupKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function canonicalArtistName(value) {
  return artistDisplayNames[normalizeLookupKey(value)] || value
}

function slugify(value) {
  return normalizeLookupKey(value).replace(/\s+/g, '-')
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extensionFor(info) {
  if (info.thumbmime === 'image/png' || info.mime === 'image/png') return '.png'
  if (info.thumbmime === 'image/webp' || info.mime === 'image/webp') return '.webp'
  const sourceExtension = extname(new URL(info.thumburl || info.url).pathname).toLowerCase()
  return sourceExtension === '.png' || sourceExtension === '.webp' ? sourceExtension : '.jpg'
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': userAgent } })
  if (!response.ok) throw new Error(`Wikimedia request failed (${response.status}): ${url}`)
  return response.json()
}

const apiUrl = new URL('https://commons.wikimedia.org/w/api.php')
apiUrl.search = new URLSearchParams({
  action: 'query',
  format: 'json',
  formatversion: '2',
  prop: 'imageinfo',
  titles: sources.map((source) => source.commonsTitle).join('|'),
  iiprop: 'canonicaltitle|url|size|sha1|mime|thumbmime|extmetadata',
  iilimit: '1',
  iiurlwidth: '1200',
  iiextmetadatalanguage: 'en',
  iiextmetadatafilter: 'License|LicenseShortName|LicenseUrl|UsageTerms|Attribution|AttributionRequired|Artist|Credit|Restrictions|ImageDescription|ObjectName',
})

const payload = await fetchJson(apiUrl)
const pages = new Map((payload.query?.pages || []).map((page) => [page.title, page]))
const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  artists: [],
  venues: [],
}

for (const source of sources) {
  const page = pages.get(source.commonsTitle)
  const info = page?.imageinfo?.[0]
  if (!info) {
    process.stderr.write(`Skipping ${source.key}: Commons image metadata was not found.\n`)
    continue
  }

  const metadata = info.extmetadata || {}
  const licenseName = plainText(metadataValue(metadata, 'LicenseShortName'))
  const restrictions = plainText(metadataValue(metadata, 'Restrictions'))
  if (!/^(?:CC0|Public domain|CC BY(?:-SA)? \d+(?:\.\d+)?)$/i.test(licenseName) || (restrictions && restrictions !== 'personality')) {
    process.stderr.write(`Skipping ${source.key}: unsupported license or restrictions (${licenseName}; ${restrictions || 'none'}).\n`)
    continue
  }

  const imageResponse = await fetch(info.thumburl || info.url, { headers: { 'User-Agent': userAgent } })
  if (!imageResponse.ok || new URL(imageResponse.url).hostname !== 'upload.wikimedia.org') {
    throw new Error(`Image download failed for ${source.key}`)
  }

  const image = Buffer.from(await imageResponse.arrayBuffer())
  if (image.length > 10 * 1024 * 1024) throw new Error(`Image for ${source.key} exceeds 10 MB`)

  const localSha256 = createHash('sha256').update(image).digest('hex')
  const extension = extensionFor(info)
  const relativePath = `${source.kind}s/${source.key}-${localSha256.slice(0, 12)}${extension}`
  const outputPath = resolve(publicRoot, relativePath)
  await mkdir(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp`
  await writeFile(temporaryPath, image)
  await rename(temporaryPath, outputPath)

  const creator = source.creator || plainText(metadataValue(metadata, 'Attribution') || metadataValue(metadata, 'Artist')) || 'Wikimedia Commons contributor'
  const title = plainText(metadataValue(metadata, 'ObjectName') || metadataValue(metadata, 'ImageDescription')) || source.names[0]
  const record = {
    key: source.key,
    names: source.names,
    title,
    imageUrl: `/media/${relativePath}`,
    width: info.thumbwidth || info.width,
    height: info.thumbheight || info.height,
    sourceUrl: info.descriptionurl,
    originalUrl: info.url,
    sourceSha1: info.sha1,
    localSha256,
    creator,
    licenseName,
    licenseUrl: metadataValue(metadata, 'LicenseUrl') || info.descriptionurl,
    creditText: `${creator} / Wikimedia Commons / ${licenseName}`,
    modifications: 'Resized and cropped for display',
    provider: 'Wikimedia Commons',
    rightsClass: 'commons-licensed',
  }

  manifest[source.kind === 'artist' ? 'artists' : 'venues'].push(record)
  process.stdout.write(`Downloaded ${source.kind} image: ${source.names[0]}\n`)
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const artistNamesByCanonicalName = new Map()
for (const entry of Object.values(catalog.parsedCatalog).flat()) {
  const canonicalName = canonicalArtistName(entry.artist)
  const names = artistNamesByCanonicalName.get(canonicalName) || new Set([canonicalName])
  names.add(entry.artist)
  artistNamesByCanonicalName.set(canonicalName, names)
}

const coveredArtistNames = new Set(manifest.artists.flatMap((record) => record.names.map(normalizeLookupKey)))
for (const [canonicalName, names] of artistNamesByCanonicalName) {
  if (coveredArtistNames.has(normalizeLookupKey(canonicalName))) continue

  const deezerUrl = new URL('https://api.deezer.com/search/artist')
  deezerUrl.searchParams.set('q', canonicalName)
  let deezerPayload
  try {
    deezerPayload = await fetchJson(deezerUrl)
  } catch (error) {
    process.stderr.write(`Skipping Deezer lookup for "${canonicalName}": ${error.message}\n`)
    continue
  }
  const candidates = (deezerPayload.data || [])
    .filter((candidate) => normalizeLookupKey(candidate.name) === normalizeLookupKey(canonicalName))
    .filter((candidate) => candidate.picture_xl && !candidate.picture_xl.includes('d41d8cd98f00b204e9800998ecf8427e'))
    .sort((left, right) => (right.nb_fan || 0) - (left.nb_fan || 0) || (right.nb_album || 0) - (left.nb_album || 0))
  const candidate = candidates[0]
  if (!candidate) {
    process.stderr.write(`Skipping "${canonicalName}": no exact Deezer artist match found.\n`)
    continue
  }

  manifest.artists.push({
    key: slugify(canonicalName),
    names: [...names],
    title: `${canonicalName} artist profile image`,
    imageUrl: candidate.picture_xl,
    width: 1000,
    height: 1000,
    sourceUrl: candidate.link,
    originalUrl: candidate.picture_xl,
    sourceSha1: null,
    localSha256: null,
    creator: canonicalName,
    licenseName: 'Image via Deezer',
    licenseUrl: 'https://developers.deezer.com/termsofuse',
    creditText: `${canonicalName} artist profile / Deezer`,
    modifications: 'Displayed remotely and cropped for card display',
    provider: 'Deezer',
    providerId: candidate.id,
    rightsClass: 'provider-promotional',
  })
  process.stdout.write(`Linked Deezer artist image: ${canonicalName}\n`)
  await new Promise((resolve) => setTimeout(resolve, 150))
}

const uncoveredArtists = [...artistNamesByCanonicalName].filter(([canonicalName]) => (
  !manifest.artists.some((record) => record.names.some((name) => normalizeLookupKey(name) === normalizeLookupKey(canonicalName)))
))
if (uncoveredArtists.length) {
  process.stderr.write(`Warning: ${uncoveredArtists.length} artist(s) missing image coverage: ${uncoveredArtists.map(([name]) => name).join(', ')}\n`)
}

await mkdir(dirname(manifestPath), { recursive: true })
const temporaryManifestPath = `${manifestPath}.tmp`
await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
await rename(temporaryManifestPath, manifestPath)
process.stdout.write(`Wrote media manifest to ${manifestPath}\n`)
