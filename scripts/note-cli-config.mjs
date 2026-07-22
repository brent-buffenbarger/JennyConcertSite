export const TEST_NOTE_PREFIX = 'Test_ABCD1234'
export const CONCERTS_NOTE_ID = 'x-coredata://7AB79664-F59E-4831-9639-CDF8AE45D422/ICNote/p9'

export function getTestNoteFilters() {
  return {
    accountName: 'iCloud',
    folderName: 'Notes',
    titlePrefix: TEST_NOTE_PREFIX,
  }
}

export function buildTestNoteBody(content) {
  const normalized = String(content || '').trim()
  return normalized
    ? `${TEST_NOTE_PREFIX}\n\n${normalized}`
    : TEST_NOTE_PREFIX
}

export function getConcertsNoteFilters() {
  return {
    noteId: CONCERTS_NOTE_ID,
  }
}

export function buildConcertsNoteBody(content) {
  const normalized = String(content || '').trim()
  return normalized
    ? `Concerts\n\n${normalized}`
    : 'Concerts'
}
