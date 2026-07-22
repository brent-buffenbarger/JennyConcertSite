import { readAppleNotes } from '../src/notes/index.mjs'
import { getConcertsNoteFilters } from './note-cli-config.mjs'

const payload = await readAppleNotes(getConcertsNoteFilters())
process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
