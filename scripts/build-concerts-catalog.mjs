import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { buildConcertsCatalogFromExport } from '../src/notes/concerts-catalog.mjs'

const inputPath = new URL('../data/notes/concerts.json', import.meta.url)
const outputPath = new URL('../data/notes/concerts.catalog.json', import.meta.url)

const exportPayload = JSON.parse(await readFile(inputPath, 'utf8'))
const catalog = buildConcertsCatalogFromExport(exportPayload)

await mkdir(dirname(outputPath.pathname), { recursive: true })
await writeFile(outputPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8')

process.stdout.write(`Built structured catalog at ${outputPath.pathname}\n`)
