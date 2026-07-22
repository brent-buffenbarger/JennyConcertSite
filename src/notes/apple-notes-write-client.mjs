import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { readAppleNotes } from './apple-notes-client.mjs'
import { textToNoteHtml } from './note-html.mjs'
import { appendLine, mutateConcertEntry, mutateConcertEntryHtml, removeExactLine, replaceBody } from './note-transforms.mjs'

const execFileAsync = promisify(execFile)
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const writeNoteScriptPath = resolve(currentDirectory, 'jxa/write-note.js')

function ensureSingleNote(payload, filters) {
  if (payload.noteCount !== 1) {
    throw new Error(`Expected exactly one matching note for write, found ${payload.noteCount} using filters ${JSON.stringify(filters)}`)
  }

  return payload.notes[0]
}

async function writeNoteBodyHtml(filters, bodyHtml, expectedModifiedAt) {
  const config = JSON.stringify({ filters, bodyHtml, expectedModifiedAt })
  const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', writeNoteScriptPath, config], {
    maxBuffer: 1024 * 1024 * 10,
  })

  const payload = JSON.parse(stdout)

  if (!payload.ok) {
    throw new Error(payload.error || 'Apple Notes write failed')
  }

  return payload
}

export async function replaceAppleNoteBody(filters, nextBodyText, options = {}) {
  return updateAppleNote(filters, () => replaceBody('', nextBodyText), options)
}

export async function appendToAppleNote(filters, line, options = {}) {
  return updateAppleNote(filters, (note) => appendLine(note.bodyText, line), options)
}

export async function removeFromAppleNote(filters, line, options = {}) {
  return updateAppleNote(filters, (note) => removeExactLine(note.bodyText, line), options)
}

export async function mutateConcertEntryInAppleNote(filters, mutation, options = {}) {
  return updateAppleNote(filters, (note) => {
    if (mutation.expectedModifiedAt && note.modifiedAt !== mutation.expectedModifiedAt) {
      throw new Error('Concerts note changed since it was loaded. Refresh and try again.')
    }
    const bodyText = mutateConcertEntry(note.bodyText, mutation)
    return { bodyText, bodyHtml: mutateConcertEntryHtml(note.bodyHtml, mutation) }
  }, options)
}

export async function updateAppleNote(filters, transform, options = {}) {
  if (typeof transform !== 'function') {
    throw new Error('transform must be a function')
  }

  const beforePayload = await readAppleNotes(filters)
  const before = ensureSingleNote(beforePayload, filters)
  const preciseFilters = { noteId: before.id }
  const transformed = await transform(before)
  const nextBodyText = typeof transformed === 'string' ? transformed : transformed.bodyText
  const nextBodyHtml = transformed && typeof transformed === 'object' && transformed.bodyHtml
    ? transformed.bodyHtml
    : textToNoteHtml(nextBodyText)

  if (options.dryRun) {
    return {
      before,
      after: {
        ...before,
        bodyHtml: nextBodyHtml,
        bodyText: nextBodyText,
      },
      rolledBack: false,
      dryRun: true,
    }
  }

  await writeNoteBodyHtml(preciseFilters, nextBodyHtml, before.modifiedAt)

  try {
    const afterPayload = await readAppleNotes(preciseFilters)
    const after = ensureSingleNote(afterPayload, preciseFilters)

    if (typeof options.verify === 'function') {
      await options.verify({ before, after, nextBodyText, nextBodyHtml })
    }

    return {
      before,
      after,
      rolledBack: false,
      dryRun: false,
    }
  } catch (error) {
    await writeNoteBodyHtml(preciseFilters, before.bodyHtml)
    throw error
  }
}
