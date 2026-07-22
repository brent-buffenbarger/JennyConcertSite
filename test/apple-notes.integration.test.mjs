import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendToAppleNote,
  concertNoteTextToHtml,
  mutateConcertEntryInAppleNote,
  readAppleNotes,
  removeFromAppleNote,
  replaceAppleNoteBody,
  updateAppleNote,
} from '../src/notes/index.mjs'

const testNoteFilters = {
  accountName: 'iCloud',
  folderName: 'Notes',
  titlePrefix: 'Test_ABCD1234',
  bodyPattern: 'programmatically pull notes from this MacBook\\.',
}

test('readAppleNotes reads the live Test_ABCD1234 note from Apple Notes', async () => {
  const payload = await readAppleNotes(testNoteFilters)

  assert.equal(payload.source, 'Apple Notes')
  assert.equal(payload.noteCount, 1)

  const [note] = payload.notes
  assert.equal(note.account, 'iCloud')
  assert.equal(note.folder, 'Notes')
  assert.match(note.name, /^Test_ABCD1234/)
  assert.match(note.bodyText, /This note is a test to make sure we can programmatically pull notes from this MacBook\./)
  assert.ok(note.id.startsWith('x-coredata://'))
  assert.ok(note.modifiedAt)
  assert.ok(note.createdAt)
})

test('appendToAppleNote appends and removeFromAppleNote removes a marker on the live test note', async () => {
  const marker = `AUTOMATION_TEST_MARKER_${Date.now()}`

  const appended = await appendToAppleNote(testNoteFilters, marker, {
    verify: ({ after }) => {
      assert.match(after.bodyText, new RegExp(marker))
    },
  })

  assert.match(appended.after.bodyText, new RegExp(marker))

  const removed = await removeFromAppleNote({ noteId: appended.after.id }, marker, {
    verify: ({ after }) => {
      assert.doesNotMatch(after.bodyText, new RegExp(marker))
    },
  })

  assert.doesNotMatch(removed.after.bodyText, new RegExp(marker))
  assert.equal(removed.after.bodyText, appended.before.bodyText)
})

test('replaceAppleNoteBody replaces the live test note body and restores the original content', async () => {
  const baseline = await readAppleNotes(testNoteFilters)
  const [original] = baseline.notes
  const replacement = `Test_ABCD1234\n\nReplacement body ${Date.now()}`

  const replaced = await replaceAppleNoteBody({ noteId: original.id }, replacement, {
    verify: ({ after }) => {
      assert.equal(after.bodyText, replacement)
    },
  })

  assert.equal(replaced.after.bodyText, replacement)

  const restored = await replaceAppleNoteBody({ noteId: original.id }, original.bodyText, {
    verify: ({ after }) => {
      assert.equal(after.bodyText, original.bodyText)
    },
  })

  assert.equal(restored.after.bodyText, original.bodyText)
})

test('mutateConcertEntryInAppleNote creates and updates section entries on the live test note', async () => {
  const baseline = await readAppleNotes(testNoteFilters)
  const [original] = baseline.notes
  const seededBody = 'Concerts\n\nWant to see\n\nArtist A\n\nHave seen\n\nArtist B ❤️\n\nFuture Concerts\n\nArtist C (Aug 1)'

  try {
    const seeded = await updateAppleNote({ noteId: original.id }, () => ({
      bodyText: seededBody,
      bodyHtml: concertNoteTextToHtml(seededBody),
    }))
    const created = await mutateConcertEntryInAppleNote({ noteId: original.id }, {
      action: 'create',
      section: 'futureConcerts',
      raw: 'Artist D (Sep 2 Venue)',
      expectedModifiedAt: seeded.after.modifiedAt,
    })
    assert.match(created.after.bodyText, /Artist D \(Sep 2 Venue\)/)

    const updated = await mutateConcertEntryInAppleNote({ noteId: original.id }, {
      action: 'update',
      section: 'futureConcerts',
      originalRaw: 'Artist D (Sep 2 Venue)',
      raw: 'Artist D (Sep 3 New Venue)',
      expectedModifiedAt: created.after.modifiedAt,
    })
    assert.doesNotMatch(updated.after.bodyText, /Artist D \(Sep 2 Venue\)/)
    assert.match(updated.after.bodyText, /Artist D \(Sep 3 New Venue\)/)
    assert.match(updated.after.bodyHtml, /<div><b>Future Concerts<\/b><br><\/div>/)
  } finally {
    await replaceAppleNoteBody({ noteId: original.id }, original.bodyText)
  }
})
