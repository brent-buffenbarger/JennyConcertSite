import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { normalizeNotesPayload } from './normalize-note-content.mjs'

const execFileAsync = promisify(execFile)
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const readNotesScriptPath = resolve(currentDirectory, 'jxa/read-notes.js')

export async function readAppleNotes(filters = {}) {
  const config = JSON.stringify(filters)
  const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', readNotesScriptPath, config], {
    maxBuffer: 1024 * 1024 * 10,
  })

  const payload = JSON.parse(stdout)
  return normalizeNotesPayload(payload)
}

export async function exportAppleNotesToFile({ filters = {}, outputPath, writeFile }) {
  if (!outputPath) {
    throw new Error('outputPath is required')
  }

  if (typeof writeFile !== 'function') {
    throw new Error('writeFile is required')
  }

  const payload = await readAppleNotes(filters)
  await writeFile(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  return payload
}
