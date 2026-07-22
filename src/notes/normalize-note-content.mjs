const HTML_BREAK_TAGS = [
  [/<br\s*\/?>/gi, '\n'],
  [/<\/div>/gi, '\n'],
  [/<\/li>/gi, '\n'],
  [/<\/ul>/gi, '\n'],
  [/<\/ol>/gi, '\n'],
  [/<\/h\d>/gi, '\n'],
]

const HTML_ENTITIES = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
]

export function normalizeLineSeparators(value) {
  return String(value).replace(/[\u2028\u2029]/g, '\n').replace(/\r/g, '')
}

export function stripHtmlToText(html) {
  let output = normalizeLineSeparators(html || '')

  for (const [pattern, replacement] of HTML_BREAK_TAGS) {
    output = output.replace(pattern, replacement)
  }

  output = output.replace(/<[^>]+>/g, '')

  for (const [pattern, replacement] of HTML_ENTITIES) {
    output = output.replace(pattern, replacement)
  }

  return output.replace(/\n{3,}/g, '\n\n').trim()
}

export function normalizeNoteRecord(note) {
  const bodyHtml = note.bodyHtml || ''
  const name = normalizeLineSeparators(note.name || '').trim()

  return {
    ...note,
    name,
    bodyHtml: normalizeLineSeparators(bodyHtml),
    bodyText: stripHtmlToText(bodyHtml),
  }
}

export function normalizeNotesPayload(payload) {
  return {
    ...payload,
    exportedAt: payload.exportedAt || new Date().toISOString(),
    noteCount: Array.isArray(payload.notes) ? payload.notes.length : 0,
    notes: (payload.notes || []).map(normalizeNoteRecord),
  }
}
