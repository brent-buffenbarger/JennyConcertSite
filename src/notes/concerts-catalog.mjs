const SECTION_LABELS = {
  'want to see': 'wantToSee',
  'have seen': 'haveSeen',
  'future concerts': 'futureConcerts',
}

const STATUS_BY_SECTION = {
  wantToSee: 'want_to_see',
  haveSeen: 'seen',
  futureConcerts: 'upcoming',
}

const RATING_LABELS = [
  ['❤️‍🔥', 'obsessed'],
  ['❤️', 'love'],
  ['🤍', 'like'],
  ['💔', 'disappointed'],
]

const MONTH_NAMES = 'jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december'
const MONTH_DAY_PATTERN = new RegExp(`^(${MONTH_NAMES})\\s+\\d{1,2}(?:\\s+or\\s+\\d{1,2})?\\b`, 'i')
const NUMERIC_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

function compactWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function trimSeparators(value) {
  return compactWhitespace(value)
    .replace(/^\s*-\s*/, '')
    .replace(/\s*-\s*$/, '')
    .trim()
}

function unwrapParenthetical(value) {
  const match = compactWhitespace(value).match(/^\(([^()]*)\)$/)
  return match ? compactWhitespace(match[1]) : compactWhitespace(value)
}

function extractRating(value) {
  for (const [symbol, label] of RATING_LABELS) {
    const index = value.indexOf(symbol)
    if (index !== -1) {
      return {
        rating: label,
        remainder: trimSeparators(value.slice(0, index)),
        trailingNotes: unwrapParenthetical(trimSeparators(value.slice(index + symbol.length))) || null,
      }
    }
  }

  return {
    rating: null,
    remainder: trimSeparators(value),
    trailingNotes: null,
  }
}

function parseTrailingParenthetical(value) {
  const match = value.match(/^(.*)\(([^()]*)\)\s*$/)

  if (!match) {
    return {
      base: value.trim(),
      metadata: null,
    }
  }

  return {
    base: match[1].trim(),
    metadata: compactWhitespace(match[2]),
  }
}

function normalizeNumericDate(value) {
  const match = value.match(NUMERIC_DATE_PATTERN)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))

  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return null
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function emptyParsedMetadata() {
  return {
    date: null,
    venue: null,
    city: null,
  }
}

function parseMonthDayMetadata(metadata) {
  if (!metadata) {
    return {
      dateText: null,
      locationText: null,
      parsed: emptyParsedMetadata(),
    }
  }

  const dateMatch = metadata.match(MONTH_DAY_PATTERN)
  const dateText = dateMatch ? compactWhitespace(dateMatch[0]) : null
  const locationText = dateMatch ? compactWhitespace(metadata.slice(dateMatch[0].length)) || null : null

  return {
    dateText,
    locationText,
    parsed: {
      date: null,
      venue: null,
      city: null,
    },
  }
}

function buildEntry({ index, raw, artist, status, rating = null, notes = null, dateText = null, locationText = null, parsed = emptyParsedMetadata() }) {
  return {
    index,
    raw,
    artist: compactWhitespace(artist),
    status,
    rating,
    notes: notes || null,
    dateText: dateText || null,
    locationText: locationText || null,
    parsed,
  }
}

function parseSeenEntry(raw, status, index) {
  const { rating, remainder, trailingNotes } = extractRating(raw)
  const { base, metadata } = parseTrailingParenthetical(remainder)
  const parts = trimSeparators(base).split(/\s+-\s+/).map(trimSeparators).filter(Boolean)
  const dateIndex = parts.findIndex((part) => NUMERIC_DATE_PATTERN.test(part))

  if (dateIndex > 0) {
    const artist = parts.slice(0, dateIndex).join(' - ')
    const dateText = parts[dateIndex]
    const locationText = parts.slice(dateIndex + 1).join(' - ') || null

    return buildEntry({
      index,
      raw,
      artist,
      status,
      rating,
      notes: trailingNotes || metadata,
      dateText,
      locationText,
      parsed: {
        date: normalizeNumericDate(dateText),
        venue: locationText,
        city: null,
      },
    })
  }

  const monthDay = parseMonthDayMetadata(metadata)
  return buildEntry({
    index,
    raw,
    artist: trimSeparators(base),
    status,
    rating,
    notes: trailingNotes || (!monthDay.dateText ? metadata : null),
    dateText: monthDay.dateText,
    locationText: monthDay.locationText,
    parsed: monthDay.parsed,
  })
}

function parseWishlistEntry(raw, status, index) {
  const [artist, ...noteParts] = raw.split(/\s+-\s+/)
  return buildEntry({
    index,
    raw,
    artist,
    status,
    notes: noteParts.join(' - ') || null,
  })
}

function parseUpcomingEntry(raw, status, index) {
  const { base, metadata } = parseTrailingParenthetical(raw)
  const { dateText, locationText, parsed } = parseMonthDayMetadata(metadata)
  return buildEntry({
    index,
    raw,
    artist: base,
    status,
    notes: metadata && !dateText ? metadata : null,
    dateText,
    locationText,
    parsed,
  })
}

export function parseConcertEntry(raw, status, index) {
  const trimmedRaw = compactWhitespace(raw)
  if (status === 'want_to_see') return parseWishlistEntry(trimmedRaw, status, index)
  if (status === 'upcoming') return parseUpcomingEntry(trimmedRaw, status, index)
  return parseSeenEntry(trimmedRaw, status, index)
}

function tokenizeBody(bodyText) {
  return String(bodyText || '')
    .split(/\n\n+/)
    .map((token) => compactWhitespace(token))
    .filter(Boolean)
}

function parseSections(bodyText) {
  const sections = {
    wantToSee: [],
    haveSeen: [],
    futureConcerts: [],
  }
  let currentSection = null

  for (const token of tokenizeBody(bodyText)) {
    const normalizedToken = token.toLowerCase()
    if (normalizedToken === 'concerts') continue

    if (SECTION_LABELS[normalizedToken]) {
      currentSection = SECTION_LABELS[normalizedToken]
      continue
    }

    if (!currentSection) continue

    sections[currentSection].push(
      parseConcertEntry(token, STATUS_BY_SECTION[currentSection], sections[currentSection].length),
    )
  }

  return sections
}

export function buildConcertsCatalogFromExport(payload) {
  if (!Array.isArray(payload?.notes) || payload.notes.length !== 1) {
    throw new Error('Concerts export payload must contain exactly one note')
  }

  const note = payload.notes[0]
  return {
    schemaVersion: 2,
    source: {
      noteId: note.id,
      title: note.name,
      account: note.account,
      folder: note.folder,
      createdAt: note.createdAt,
      modifiedAt: note.modifiedAt,
      exportedAt: payload.exportedAt || null,
    },
    rawExport: {
      bodyHtml: note.bodyHtml,
      bodyText: note.bodyText,
    },
    parsedCatalog: parseSections(note.bodyText),
  }
}
