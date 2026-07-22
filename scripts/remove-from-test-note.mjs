import { removeFromAppleNote } from '../src/notes/index.mjs'
import { getTestNoteFilters } from './note-cli-config.mjs'

const line = process.argv[2]

if (!line) {
  throw new Error('Usage: node scripts/remove-from-test-note.mjs "EXACT LINE TO REMOVE"')
}

const result = await removeFromAppleNote(getTestNoteFilters(), line)
process.stdout.write(JSON.stringify(result.after, null, 2) + '\n')
