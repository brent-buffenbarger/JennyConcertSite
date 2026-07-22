import mediaManifest from '../data/concert-media.json'

const artistDisplayNames = {
  'alanis morisette': 'Alanis Morissette',
  'g eazy': 'G-Eazy',
  'glass animals': 'Glass Animals',
  'good neighbors': 'Good Neighbours',
  'jon belion': 'Jon Bellion',
  maneskin: 'Måneskin',
  'one republic': 'OneRepublic',
}

const venueDetails = {
  'east end studios': { name: 'East End Studios', city: 'Glendale, CA', neighborhood: 'Glendale', venueType: 'studio', lat: 34.1467, lng: -118.2549 },
  echoplex: { name: 'Echoplex', city: 'Los Angeles, CA', neighborhood: 'Echo Park', venueType: 'club', lat: 34.0777, lng: -118.2603 },
  'gallivan center': { name: 'Gallivan Center', city: 'Salt Lake City, UT', neighborhood: 'Downtown', venueType: 'plaza', lat: 40.7635, lng: -111.8899 },
  'greek theatre': { name: 'Greek Theatre', city: 'Los Angeles, CA', neighborhood: 'Griffith Park', venueType: 'amphitheatre', lat: 34.1197, lng: -118.2917 },
  'hollywood bowl': { name: 'Hollywood Bowl', city: 'Los Angeles, CA', neighborhood: 'Hollywood Hills', venueType: 'amphitheatre', lat: 34.1122, lng: -118.3394 },
  'hollywood casino amphitheatre': { name: 'Hollywood Casino Amphitheatre', city: 'Maryland Heights, MO', neighborhood: 'St. Louis suburbs', venueType: 'amphitheatre', lat: 38.7086, lng: -90.4881 },
  'hollywood forever cemetery': { name: 'Hollywood Forever Cemetery', city: 'Los Angeles, CA', neighborhood: 'Hollywood', venueType: 'cemetery', lat: 34.0895, lng: -118.3196 },
  'hollywood palladium': { name: 'Hollywood Palladium', city: 'Los Angeles, CA', neighborhood: 'Hollywood', venueType: 'ballroom', lat: 34.0982, lng: -118.3252 },
  kia: { name: 'Kia Forum', city: 'Inglewood, CA', neighborhood: 'Inglewood', venueType: 'arena', lat: 33.9583, lng: -118.3417 },
  'kia forum': { name: 'Kia Forum', city: 'Inglewood, CA', neighborhood: 'Inglewood', venueType: 'arena', lat: 33.9583, lng: -118.3417 },
  'pacific amphitheatre': { name: 'Pacific Amphitheatre', city: 'Costa Mesa, CA', neighborhood: 'OC Fairgrounds', venueType: 'amphitheatre', lat: 33.6787, lng: -117.9161 },
  'permanent records roadhouse': { name: 'Permanent Records Roadhouse', city: 'Los Angeles, CA', neighborhood: 'Cypress Park', venueType: 'club', lat: 34.0906, lng: -118.2222 },
  'sofi stadium': { name: 'SoFi Stadium', city: 'Inglewood, CA', neighborhood: 'Inglewood', venueType: 'stadium', lat: 33.9535, lng: -118.3392 },
  'tao beach dayclub': { name: 'TAO Beach Dayclub', city: 'Las Vegas, NV', neighborhood: 'The Strip', venueType: 'dayclub', lat: 36.1214, lng: -115.1745 },
  'the belasco': { name: 'The Belasco', city: 'Los Angeles, CA', neighborhood: 'Downtown', venueType: 'theater', lat: 34.0439, lng: -118.2597 },
  'the fonda': { name: 'The Fonda Theatre', city: 'Los Angeles, CA', neighborhood: 'Hollywood', venueType: 'theater', lat: 34.1017, lng: -118.3264 },
  'the fonda theatre': { name: 'The Fonda Theatre', city: 'Los Angeles, CA', neighborhood: 'Hollywood', venueType: 'theater', lat: 34.1017, lng: -118.3264 },
  'the novo': { name: 'The Novo', city: 'Los Angeles, CA', neighborhood: 'Downtown', venueType: 'theater', lat: 34.0453, lng: -118.2669 },
  'the regent theater': { name: 'The Regent Theater', city: 'Los Angeles, CA', neighborhood: 'Downtown', venueType: 'theater', lat: 34.0459, lng: -118.2483 },
  'the roxy': { name: 'The Roxy Theatre', city: 'West Hollywood, CA', neighborhood: 'Sunset Strip', venueType: 'club', lat: 34.0906, lng: -118.3856 },
  'the roxy theatre': { name: 'The Roxy Theatre', city: 'West Hollywood, CA', neighborhood: 'Sunset Strip', venueType: 'club', lat: 34.0906, lng: -118.3856 },
  'usana amphitheatre': { name: 'USANA Amphitheatre', city: 'West Valley City, UT', neighborhood: 'West Valley', venueType: 'amphitheatre', lat: 40.6836, lng: -112.0356 },
  'venice west': { name: 'Venice West', city: 'Venice, CA', neighborhood: 'Venice Beach', venueType: 'club', lat: 33.9903, lng: -118.4644 },
  'youtube theater': { name: 'YouTube Theater', city: 'Inglewood, CA', neighborhood: 'Inglewood', venueType: 'theater', lat: 33.9527, lng: -118.3392 },
}

const venueTypeLabels = {
  amphitheatre: 'Amphitheatre',
  arena: 'Arena',
  ballroom: 'Ballroom',
  cemetery: 'Cemetery',
  club: 'Club',
  dayclub: 'Dayclub',
  plaza: 'Plaza',
  stadium: 'Stadium',
  studio: 'Studio',
  theater: 'Theater',
}

const ratingDetails = {
  obsessed: { label: 'All-time favorite', score: 5, emoji: '❤️‍🔥' },
  love: { label: 'Loved it', score: 4.5, emoji: '❤️' },
  like: { label: 'Liked it', score: 3.5, emoji: '🤍' },
  disappointed: { label: 'Not a favorite', score: 2, emoji: '💔' },
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

function buildMediaIndex(records) {
  return new Map(records.flatMap((record) => record.names.map((name) => [normalizeLookupKey(name), record])))
}

function buildMediaIndexes(manifest) {
  return {
    artistMediaByName: buildMediaIndex(manifest.artists || []),
    venueMediaByName: buildMediaIndex(manifest.venues || []),
  }
}

const defaultMediaIndexes = buildMediaIndexes(mediaManifest)

function encodeSvg(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function posterLines(artist) {
  const words = artist.toUpperCase().split(/\s+/)
  const lines = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > 13 && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)
  return lines.slice(0, 3)
}

function buildPosterStyle(seed) {
  const styles = [
    { background: '#fffdf9', primary: '#9e3e61', secondary: '#1f2a33', layout: 0 },
    { background: '#315c70', primary: '#fffdf9', secondary: '#f0cbd8', layout: 1 },
    { background: '#d3e8f0', primary: '#1f2a33', secondary: '#9e3e61', layout: 2 },
    { background: '#9e3e61', primary: '#fffdf9', secondary: '#315c70', layout: 3 },
    { background: '#f3e4a6', primary: '#1f2a33', secondary: '#315c70', layout: 1 },
    { background: '#f0cbd8', primary: '#1f2a33', secondary: '#315c70', layout: 2 },
  ]

  const code = Array.from(seed).reduce(
    (total, char) => Math.imul(total ^ char.charCodeAt(0), 16777619),
    2166136261,
  ) >>> 0
  return {
    ...styles[code % styles.length],
    layout: Math.floor(code / styles.length) % 4,
    edition: String(code % 97).padStart(2, '0'),
  }
}

function buildPosterDataUrl(artist, index) {
  const style = buildPosterStyle(`${artist}:${index}`)
  const lines = posterLines(artist)
  const text = lines
    .map((line, index) => `<text x="64" y="${650 + index * 105}" font-family="Impact, Arial Narrow, sans-serif" font-size="92" letter-spacing="1" fill="${style.primary}">${escapeXml(line)}</text>`)
    .join('')
  const motif = [
    `<circle cx="640" cy="205" r="185" fill="none" stroke="${style.secondary}" stroke-width="55"/><path d="M80 330H720" stroke="${style.primary}" stroke-width="28"/>`,
    `<path d="M-60 220L860 20V265L-60 465Z" fill="${style.secondary}"/><circle cx="650" cy="420" r="130" fill="none" stroke="${style.primary}" stroke-width="24"/>`,
    `<rect x="470" y="70" width="250" height="430" fill="${style.secondary}"/><path d="M80 150L380 500" stroke="${style.primary}" stroke-width="52"/>`,
    `<circle cx="210" cy="230" r="155" fill="${style.secondary}"/><rect x="390" y="80" width="330" height="250" fill="none" stroke="${style.primary}" stroke-width="30"/>`,
  ][style.layout]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
      <rect width="800" height="1000" fill="${style.background}" />
      ${motif}
      <text x="64" y="82" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5" fill="${style.primary}">JENNY + BRENT</text>
      <text x="690" y="82" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="end" fill="${style.primary}">NO. ${style.edition}</text>
      ${text}
      <path d="M64 948H736" stroke="${style.primary}" stroke-width="3"/>
      <text x="64" y="978" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="4" fill="${style.primary}">A NIGHT TO REMEMBER</text>
    </svg>
  `.trim()

  return encodeSvg(svg)
}

function buildVenueSearch(artist, venueName, venueCity) {
  if (!venueName) return null
  const query = `${artist} ${venueName} ${venueCity || ''} concert venue`
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`
}

function venueNameLines(name) {
  const words = name.toUpperCase().split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > 16 && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 2)
}

const venueMarkPalettes = [
  { background: '#f7f4ef', ink: '#1f2a33', accent: '#9e3e61', hair: '#c2d2d8' },
  { background: '#e3edf1', ink: '#1f2a33', accent: '#315c70', hair: '#b6c7ce' },
  { background: '#1f2a33', ink: '#f7f4ef', accent: '#f6e2e8', hair: '#52606a' },
  { background: '#f6e2e8', ink: '#1f2a33', accent: '#9e3e61', hair: '#d9bec8' },
]

function venueSkylineFor(venueType, palette) {
  const stroke = palette.ink
  const accent = palette.accent
  switch (venueType) {
    case 'stadium':
    case 'arena':
      return `<path d="M40 210 Q400 90 760 210" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M40 250 Q400 130 760 250" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="3 7"/><path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/>`
    case 'amphitheatre':
      return `<path d="M40 250 Q400 40 760 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M60 250 L120 250 L120 220 L180 220 L180 250 L240 250 L240 200 L300 200 L300 250 L360 250 L360 180 L420 180 L420 250 L480 250 L480 200 L540 200 L540 250 L600 250 L600 220 L660 220 L660 250 L720 250" fill="none" stroke="${accent}" stroke-width="2"/><path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/>`
    case 'ballroom':
    case 'theater':
      return `<rect x="140" y="90" width="520" height="160" fill="none" stroke="${stroke}" stroke-width="2"/><rect x="180" y="120" width="440" height="100" fill="none" stroke="${accent}" stroke-width="1.5"/><path d="M180 170 L620 170" stroke="${accent}" stroke-width="1" stroke-dasharray="2 4"/><path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/>`
    case 'club':
    case 'dayclub':
      return `<rect x="180" y="130" width="440" height="120" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M180 130 L400 70 L620 130" fill="none" stroke="${stroke}" stroke-width="2"/><circle cx="400" cy="190" r="18" fill="none" stroke="${accent}" stroke-width="2"/><circle cx="400" cy="190" r="6" fill="${accent}"/><path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/>`
    case 'cemetery':
      return `<path d="M120 250 Q120 190 160 190 Q200 190 200 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M260 250 Q260 200 300 200 Q340 200 340 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M420 250 L420 180 L480 180 L480 250" fill="none" stroke="${accent}" stroke-width="2"/><path d="M540 250 Q540 195 580 195 Q620 195 620 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/>`
    case 'plaza':
      return `<path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/><path d="M120 250 L120 160 L200 160 L200 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M260 250 L260 120 L340 120 L340 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M400 250 L400 180 L460 180 L460 250" fill="none" stroke="${accent}" stroke-width="2"/><path d="M520 250 L520 140 L600 140 L600 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M660 250 L660 190 L720 190 L720 250" fill="none" stroke="${stroke}" stroke-width="2"/>`
    case 'studio':
      return `<rect x="180" y="120" width="440" height="130" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M180 120 L620 120" stroke="${accent}" stroke-width="4"/><path d="M240 250 L240 180 L280 180 L280 250" fill="none" stroke="${stroke}" stroke-width="1.5"/><path d="M520 250 L520 180 L560 180 L560 250" fill="none" stroke="${stroke}" stroke-width="1.5"/><path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/>`
    default:
      return `<path d="M40 250 L760 250" stroke="${stroke}" stroke-width="1"/><path d="M180 250 L180 170 L280 170 L280 250" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M340 250 L340 140 L440 140 L440 250" fill="none" stroke="${accent}" stroke-width="2"/><path d="M500 250 L500 170 L600 170 L600 250" fill="none" stroke="${stroke}" stroke-width="2"/>`
  }
}

function buildVenueMarkDataUrl(venueName, city, venueType) {
  if (!venueName) return null
  const seed = `${venueName}:${city || ''}`
  const code = Array.from(seed).reduce(
    (total, char) => Math.imul(total ^ char.charCodeAt(0), 16777619),
    2166136261,
  ) >>> 0
  const palette = venueMarkPalettes[code % venueMarkPalettes.length]
  const lines = venueNameLines(venueName)
  const typeLabel = venueTypeLabels[venueType] || 'Venue'
  const cityLabel = (city || '').toUpperCase()

  // Text stack lives in the lower band. Name lines are 60px tall each.
  const nameFirstY = lines.length === 1 ? 380 : 340
  const lineHeight = 62
  const nameText = lines
    .map((line, index) => `<text x="60" y="${nameFirstY + index * lineHeight}" font-family="Impact, Arial Narrow, sans-serif" font-size="58" letter-spacing="1" fill="${palette.ink}">${escapeXml(line)}</text>`)
    .join('')
  const typeY = nameFirstY + lines.length * lineHeight + 8
  const skyline = venueSkylineFor(venueType, palette)

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">
      <rect width="800" height="500" fill="${palette.background}"/>
      <g opacity="0.85">${skyline}</g>
      <path d="M60 300 L160 300" stroke="${palette.accent}" stroke-width="3"/>
      <text x="60" y="290" font-family="Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="4" fill="${palette.accent}">A PLACE ON THE MAP</text>
      ${nameText}
      <text x="60" y="${typeY}" font-family="Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="4" fill="${palette.ink}" opacity="0.7">${escapeXml(typeLabel.toUpperCase())}${cityLabel ? ` \u00B7 ${escapeXml(cityLabel)}` : ''}</text>
    </svg>
  `.trim()

  return encodeSvg(svg)
}

function formatDate(entry) {
  if (!entry.parsed?.date) return entry.dateText || null
  const [year, month, day] = entry.parsed.date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function createConcertEnricher(manifest = mediaManifest) {
  const indexes = buildMediaIndexes(manifest)
  return (entry) => enrichConcertEntry(entry, indexes)
}

export function enrichConcertEntry(entry, mediaIndexes = defaultMediaIndexes) {
  const { artistMediaByName, venueMediaByName } = mediaIndexes
  const sourceArtist = entry.artist
  const artist = artistDisplayNames[normalizeLookupKey(sourceArtist)] || sourceArtist
  const artistMedia = artistMediaByName.get(normalizeLookupKey(artist)) || artistMediaByName.get(normalizeLookupKey(sourceArtist)) || null
  const rawVenue = entry.parsed?.venue || entry.locationText || null
  const venue = venueDetails[normalizeLookupKey(rawVenue)] || (rawVenue ? { name: rawVenue, city: null } : null)
  const venueMedia = venue
    ? venueMediaByName.get(normalizeLookupKey(venue.name)) || venueMediaByName.get(normalizeLookupKey(rawVenue)) || null
    : null
  const rating = ratingDetails[entry.rating] || {
    label: 'Not rated yet',
    score: null,
    emoji: '🎵',
  }
  const posterUrl = buildPosterDataUrl(artist, entry.index)

  return {
    ...entry,
    artist,
    sourceArtist,
    concertName: `${artist} live`,
    artistHref: `https://www.google.com/search?q=${encodeURIComponent(artist)}`,
    imageUrl: artistMedia?.imageUrl || posterUrl,
    imageAlt: artistMedia ? `${artist} artist photo` : `${artist} poster art`,
    imageType: artistMedia ? 'artist' : 'poster',
    posterUrl,
    artistMedia,
    venueName: venue?.name || null,
    venueCity: venue?.city || null,
    venueNeighborhood: venue?.neighborhood || null,
    venueType: venue?.venueType || null,
    venueTypeLabel: venue?.venueType ? venueTypeLabels[venue.venueType] || null : null,
    venueLat: typeof venue?.lat === 'number' ? venue.lat : null,
    venueLng: typeof venue?.lng === 'number' ? venue.lng : null,
    venueAddress: null,
    venueMedia,
    venueMark: venue?.name ? buildVenueMarkDataUrl(venue.name, venue.city, venue.venueType) : null,
    venueMapUrl: buildVenueSearch(artist, venue?.name, venue?.city),
    dateLabel: formatDate(entry) || 'Date not added yet',
    ratingLabel: rating.label,
    ratingScore: rating.score,
    ratingEmoji: rating.emoji,
    media: [artistMedia, venueMedia].filter(Boolean),
  }
}
