import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { exportAppleNotesToFile } from '../src/notes/index.mjs'
import { getConcertsNoteFilters } from './note-cli-config.mjs'

const outputPath = new URL('../data/notes/concerts.json', import.meta.url)

await mkdir(dirname(outputPath.pathname), { recursive: true })

const payload = await exportAppleNotesToFile({
  filters: getConcertsNoteFilters(),
  outputPath,
  writeFile,
})

process.stdout.write(`Exported ${payload.noteCount} note(s) to ${outputPath.pathname}\n`)
