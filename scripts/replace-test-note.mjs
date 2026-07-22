import { replaceAppleNoteBody } from '../src/notes/index.mjs'
import { buildTestNoteBody, getTestNoteFilters } from './note-cli-config.mjs'

const content = process.argv[2]

if (content === undefined) {
  throw new Error('Usage: node scripts/replace-test-note.mjs "NEW BODY CONTENT"')
}

const nextBody = buildTestNoteBody(content)
const result = await replaceAppleNoteBody(getTestNoteFilters(), nextBody)
process.stdout.write(JSON.stringify(result.after, null, 2) + '\n')
