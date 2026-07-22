import { normalizeLineSeparators, stripHtmlToText } from './normalize-note-content.mjs'

function trimTrailingWhitespace(value) {
  return value.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

const concertSectionLabels = {
  wantToSee: 'Want to see',
  haveSeen: 'Have seen',
  futureConcerts: 'Future Concerts',
}

function normalizeConcertEntry(value) {
  const normalized = trimTrailingWhitespace(normalizeLineSeparators(value || ''))
  if (!normalized || normalized.includes('\n')) {
    throw new Error('Concert entries must contain exactly one non-empty line')
  }
  if (Object.values(concertSectionLabels).some((label) => label.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('Concert entries cannot use a section heading')
  }
  return normalized
}

function concertTokens(bodyText) {
  return trimTrailingWhitespace(normalizeLineSeparators(bodyText || ''))
    .split(/\n\s*\n/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function sectionBounds(tokens, section) {
  const label = concertSectionLabels[section]
  if (!label) throw new Error(`Unknown concert section: ${section}`)

  const start = tokens.findIndex((token) => token.toLowerCase() === label.toLowerCase())
  if (start === -1) throw new Error(`Concert section not found: ${label}`)

  const headings = new Set(Object.values(concertSectionLabels).map((value) => value.toLowerCase()))
  const nextHeadingOffset = tokens.slice(start + 1).findIndex((token) => headings.has(token.toLowerCase()))
  return {
    start: start + 1,
    end: nextHeadingOffset === -1 ? tokens.length : start + 1 + nextHeadingOffset,
  }
}

export function mutateConcertEntry(bodyText, mutation) {
  const tokens = concertTokens(bodyText)
  const raw = normalizeConcertEntry(mutation.raw)
  const bounds = sectionBounds(tokens, mutation.section)

  if (mutation.action === 'create') {
    tokens.splice(bounds.end, 0, raw)
  } else if (mutation.action === 'update') {
    const originalRaw = normalizeConcertEntry(mutation.originalRaw)
    const matches = []
    for (let index = bounds.start; index < bounds.end; index += 1) {
      if (tokens[index] === originalRaw) matches.push(index)
    }
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one matching concert entry in ${concertSectionLabels[mutation.section]}, found ${matches.length}`)
    }
    tokens[matches[0]] = raw
  } else {
    throw new Error(`Unknown concert mutation action: ${mutation.action}`)
  }

  return tokens.join('\n\n')
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function htmlSectionBounds(bodyHtml, section) {
  const label = concertSectionLabels[section]
  if (!label) throw new Error(`Unknown concert section: ${section}`)
  const headingPattern = new RegExp(`<div\\b[^>]*>(?:<[^>]+>|\\s)*${escapeRegExp(label)}(?:<[^>]+>|\\s)*<\\/div>`, 'i')
  const heading = headingPattern.exec(bodyHtml)
  if (!heading) throw new Error(`Concert section not found in note formatting: ${label}`)

  const start = heading.index + heading[0].length
  const laterHeadings = Object.values(concertSectionLabels)
    .filter((candidate) => candidate !== label)
    .map((candidate) => {
      const match = new RegExp(`<div\\b[^>]*>(?:<[^>]+>|\\s)*${escapeRegExp(candidate)}(?:<[^>]+>|\\s)*<\\/div>`, 'i').exec(bodyHtml.slice(start))
      return match ? start + match.index : Number.POSITIVE_INFINITY
    })
  return { start, end: Math.min(bodyHtml.length, ...laterHeadings) }
}

export function mutateConcertEntryHtml(bodyHtml, mutation) {
  const normalizedHtml = normalizeLineSeparators(bodyHtml || '')
  const raw = normalizeConcertEntry(mutation.raw)
  const bounds = htmlSectionBounds(normalizedHtml, mutation.section)
  const sectionHtml = normalizedHtml.slice(bounds.start, bounds.end)

  if (mutation.action === 'create') {
    const listEnd = sectionHtml.lastIndexOf('</ul>')
    if (listEnd === -1) throw new Error(`Concert section list not found: ${concertSectionLabels[mutation.section]}`)
    const insertionPoint = bounds.start + listEnd
    return `${normalizedHtml.slice(0, insertionPoint)}<li>${escapeHtml(raw)}</li>\n${normalizedHtml.slice(insertionPoint)}`
  }

  if (mutation.action !== 'update') throw new Error(`Unknown concert mutation action: ${mutation.action}`)
  const originalRaw = normalizeConcertEntry(mutation.originalRaw)
  const listItemPattern = /<li\b[^>]*>[\s\S]*?<\/li>/gi
  const matches = [...sectionHtml.matchAll(listItemPattern)]
    .filter((match) => stripHtmlToText(match[0]).trim() === originalRaw)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one matching formatted concert entry in ${concertSectionLabels[mutation.section]}, found ${matches.length}`)
  }

  const match = matches[0]
  const start = bounds.start + match.index
  const end = start + match[0].length
  const openingTag = match[0].match(/^<li\b[^>]*>/i)?.[0] || '<li>'
  return `${normalizedHtml.slice(0, start)}${openingTag}${escapeHtml(raw)}</li>${normalizedHtml.slice(end)}`
}

export function concertNoteTextToHtml(bodyText) {
  const tokens = concertTokens(bodyText)
  const title = tokens[0]?.toLowerCase() === 'concerts' ? tokens.shift() : 'Concerts'
  const headings = new Set(Object.values(concertSectionLabels).map((value) => value.toLowerCase()))
  const output = [`<div><h1>${escapeHtml(title)}</h1></div>`]
  let index = 0

  while (index < tokens.length) {
    const label = tokens[index]
    if (!headings.has(label.toLowerCase())) {
      throw new Error(`Unexpected content before a Concerts section: ${label}`)
    }
    index += 1
    const entries = []
    while (index < tokens.length && !headings.has(tokens[index].toLowerCase())) {
      entries.push(tokens[index])
      index += 1
    }
    output.push(`<div><b>${escapeHtml(label)}</b><br></div>`)
    output.push('<ul>')
    output.push(...entries.map((entry) => `<li>${escapeHtml(entry)}</li>`))
    output.push('</ul>')
  }

  return `${output.join('\n')}\n`
}

export function appendLine(bodyText, line) {
  const normalizedBody = trimTrailingWhitespace(normalizeLineSeparators(bodyText || ''))
  const normalizedLine = trimTrailingWhitespace(normalizeLineSeparators(line || ''))

  if (!normalizedLine) {
    return normalizedBody
  }

  return normalizedBody ? `${normalizedBody}\n\n${normalizedLine}` : normalizedLine
}

export function removeExactLine(bodyText, line) {
  const normalizedBody = normalizeLineSeparators(bodyText || '')
  const normalizedLine = trimTrailingWhitespace(normalizeLineSeparators(line || ''))

  const keptLines = normalizedBody
    .split('\n')
    .filter((entry) => trimTrailingWhitespace(entry) !== normalizedLine)

  return trimTrailingWhitespace(keptLines.join('\n'))
}

export function replaceBody(_currentBodyText, nextBodyText) {
  return trimTrailingWhitespace(normalizeLineSeparators(nextBodyText || ''))
}
