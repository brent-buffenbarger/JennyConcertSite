import { normalizeLineSeparators } from './normalize-note-content.mjs'

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function textToNoteHtml(bodyText) {
  const normalized = normalizeLineSeparators(bodyText || '').trim()

  if (!normalized) {
    return '<div><br></div>\n'
  }

  const blocks = normalized.split(/\n\n+/)
  const html = blocks
    .map((block) => `<div>${escapeHtml(block).replace(/\n/g, '<br>')}</div>`)
    .join('\n')

  return `${html}\n`
}
