import { mutateConcertEntryInAppleNote } from '../src/notes/index.mjs'
import { getConcertsNoteFilters } from './note-cli-config.mjs'

const payload = process.argv[2] ? JSON.parse(process.argv[2]) : null
if (!payload) throw new Error('Expected a concert entry mutation payload')

const result = await mutateConcertEntryInAppleNote(getConcertsNoteFilters(), payload, {
  verify: ({ after }) => {
    if (!after.bodyText.split(/\n\s*\n/).map((entry) => entry.trim()).includes(payload.raw.trim())) {
      throw new Error('The updated Concerts note could not be verified')
    }
  },
})

process.stdout.write(`${JSON.stringify(result.after, null, 2)}\n`)
