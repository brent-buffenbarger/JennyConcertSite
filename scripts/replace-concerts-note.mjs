import { replaceAppleNoteBody } from '../src/notes/index.mjs'
import { buildConcertsNoteBody, getConcertsNoteFilters } from './note-cli-config.mjs'

const content = process.argv[2]

if (content === undefined) {
  throw new Error('Usage: node scripts/replace-concerts-note.mjs "NEW BODY CONTENT"')
}

const nextBody = buildConcertsNoteBody(content)
const result = await replaceAppleNoteBody(getConcertsNoteFilters(), nextBody)
process.stdout.write(JSON.stringify(result.after, null, 2) + '\n')
