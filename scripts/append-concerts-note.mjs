import { appendToAppleNote } from '../src/notes/index.mjs'
import { getConcertsNoteFilters } from './note-cli-config.mjs'

const line = process.argv[2]

if (!line) {
  throw new Error('Usage: node scripts/append-concerts-note.mjs "LINE TO APPEND"')
}

const result = await appendToAppleNote(getConcertsNoteFilters(), line)
process.stdout.write(JSON.stringify(result.after, null, 2) + '\n')
