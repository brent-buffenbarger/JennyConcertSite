#!/usr/bin/osascript -l JavaScript

function toIsoDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function readConfig(argv) {
  if (!argv || argv.length === 0) return {}
  return JSON.parse(argv[0])
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

function collectNotes(config) {
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

        const bodyHtml = note.body()
        matches.push({
          id: note.id(),
          name: note.name(),
          account: accountName,
          folder: folderName,
          createdAt: toIsoDate(note.creationDate()),
          modifiedAt: toIsoDate(note.modificationDate()),
          bodyHtml,
        })
      }
    }
  }

  return {
    source: 'Apple Notes',
    noteCount: matches.length,
    notes: matches,
  }
}

function run(argv) {
  const config = readConfig(argv)
  return JSON.stringify(collectNotes(config))
}
