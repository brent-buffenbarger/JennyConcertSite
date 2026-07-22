import { readAppleNotes } from '../src/notes/index.mjs'
import { getTestNoteFilters } from './note-cli-config.mjs'

const payload = await readAppleNotes(getTestNoteFilters())
process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
