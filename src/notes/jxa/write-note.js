#!/usr/bin/osascript -l JavaScript

function readConfig(argv) {
  if (!argv || argv.length === 0) {
    throw new Error('Expected a JSON config argument')
  }

  return JSON.parse(argv[0])
}

function toIsoDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function matchesPrefix(value, prefix) {
  return !prefix || value.startsWith(prefix)
}

function matchesRegex(value, pattern, flags) {
  if (!pattern) return true
  return new RegExp(pattern, flags || '').test(value)
}

function noteMatches(note, config) {
  if (config.noteId && note.id() !== config.noteId) {
    return false
  }

  const name = note.name()
  const body = note.body()

  return matchesPrefix(name, config.titlePrefix) &&
    matchesRegex(name, config.titlePattern, config.titleFlags) &&
    matchesRegex(body, config.bodyPattern, config.bodyFlags)
}

function selectNotes(config) {
  const Notes = Application('Notes')
  const matches = []

  for (const account of Notes.accounts()) {
    const accountName = account.name()
    if (config.accountName && accountName !== config.accountName) continue

    for (const folder of account.folders()) {
      const folderName = folder.name()
      if (config.folderName && folderName !== config.folderName) continue

      for (const note of folder.notes()) {
        if (!noteMatches(note, config)) continue

        matches.push({ note, accountName, folderName })
      }
    }
  }

  return matches
}

function summarize(match) {
  return {
    id: match.note.id(),
    name: match.note.name(),
    account: match.accountName,
    folder: match.folderName,
    modifiedAt: String(match.note.modificationDate()),
    bodyHtml: match.note.body(),
  }
}

function run(argv) {
  const config = readConfig(argv)
  const matches = selectNotes(config.filters || {})

  if (matches.length !== 1) {
    return JSON.stringify({
      ok: false,
      matchCount: matches.length,
      error: `Expected exactly one matching note, found ${matches.length}`,
    })
  }

  const match = matches[0]
  const before = summarize(match)
  const currentModifiedAt = toIsoDate(match.note.modificationDate())
  if (config.expectedModifiedAt && currentModifiedAt !== config.expectedModifiedAt) {
    return JSON.stringify({
      ok: false,
      error: 'Concerts note changed since it was loaded. Refresh and try again.',
      currentModifiedAt,
    })
  }
  match.note.body = config.bodyHtml
  const after = summarize(match)

  return JSON.stringify({
    ok: true,
    before,
    after,
  })
}
