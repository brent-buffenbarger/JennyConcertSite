import test from 'node:test'
import assert from 'node:assert/strict'

import { appendLine, concertNoteTextToHtml, mutateConcertEntry, mutateConcertEntryHtml, removeExactLine, replaceBody, textToNoteHtml } from '../src/notes/index.mjs'

test('appendLine adds a separated line to existing note text', () => {
  assert.equal(appendLine('Hello', 'MARKER'), 'Hello\n\nMARKER')
})

test('removeExactLine removes only the target line and normalizes spacing', () => {
  assert.equal(removeExactLine('Hello\n\nMARKER\n\nWorld', 'MARKER'), 'Hello\n\nWorld')
})

test('replaceBody normalizes Apple line separators', () => {
  assert.equal(replaceBody('ignored', 'A\u2028B'), 'A\nB')
})

test('textToNoteHtml wraps text blocks in divs and escapes html characters', () => {
  assert.equal(textToNoteHtml('A < B\n\nC & D'), '<div>A &lt; B</div>\n<div>C &amp; D</div>\n')
})

const concertsBody = 'Concerts\n\nWant to see\n\nArtist A\n\nHave seen\n\nArtist B ❤️\n\nFuture Concerts\n\nArtist C (Aug 1)'

test('mutateConcertEntry adds an entry to the requested section', () => {
  const result = mutateConcertEntry(concertsBody, { action: 'create', section: 'wantToSee', raw: 'Artist D' })
  assert.match(result, /Artist A\n\nArtist D\n\nHave seen/)
})

test('mutateConcertEntry replaces exactly one entry in place', () => {
  const result = mutateConcertEntry(concertsBody, { action: 'update', section: 'haveSeen', originalRaw: 'Artist B ❤️', raw: 'Artist B - 01\/02\/2025 - The Venue - ❤️' })
  assert.match(result, /Have seen\n\nArtist B - 01\/02\/2025 - The Venue - ❤️\n\nFuture Concerts/)
})

test('mutateConcertEntry rejects missing and duplicate update targets', () => {
  assert.throws(
    () => mutateConcertEntry(concertsBody, { action: 'update', section: 'haveSeen', originalRaw: 'Missing', raw: 'Replacement' }),
    /found 0/,
  )
  const duplicated = concertsBody.replace('Artist B ❤️', 'Artist B ❤️\n\nArtist B ❤️')
  assert.throws(
    () => mutateConcertEntry(duplicated, { action: 'update', section: 'haveSeen', originalRaw: 'Artist B ❤️', raw: 'Replacement' }),
    /found 2/,
  )
})

test('mutateConcertEntry rejects multiline entries and section headings', () => {
  assert.throws(() => mutateConcertEntry(concertsBody, { action: 'create', section: 'wantToSee', raw: 'A\nB' }), /one non-empty line/)
  assert.throws(() => mutateConcertEntry(concertsBody, { action: 'create', section: 'wantToSee', raw: 'Have seen' }), /section heading/)
})

test('concertNoteTextToHtml keeps headings and entries in list markup', () => {
  const html = concertNoteTextToHtml(concertsBody)
  assert.match(html, /<div><b>Want to see<\/b><br><\/div>\n<ul>\n<li>Artist A<\/li>\n<\/ul>/)
  assert.match(html, /<li>Artist B ❤️<\/li>/)
})

const concertsHtml = `<div><h1>Concerts</h1></div>
<div><b>Want to see</b><br></div>
<ul><li>Artist A</li></ul>
<div><b>Have seen</b><br></div>
<ul><li>Artist B ❤️<br></li><ul><li>Nested Opener 🤍</li></ul></ul>
<div><b>Future Concerts</b><br></div>
<ul><li>Artist C (Aug 1)</li></ul>`

test('mutateConcertEntryHtml updates one list item without flattening nested lists', () => {
  const result = mutateConcertEntryHtml(concertsHtml, { action: 'update', section: 'haveSeen', originalRaw: 'Artist B ❤️', raw: 'Artist B - 01/02/2025 - Venue - ❤️' })
  assert.match(result, /<li>Artist B - 01\/02\/2025 - Venue - ❤️<\/li>/)
  assert.match(result, /<ul><li>Nested Opener 🤍<\/li><\/ul>/)
})

test('mutateConcertEntryHtml adds to the target outer list without changing other sections', () => {
  const result = mutateConcertEntryHtml(concertsHtml, { action: 'create', section: 'haveSeen', raw: 'Artist D ❤️' })
  assert.match(result, /<ul><li>Nested Opener 🤍<\/li><\/ul><li>Artist D ❤️<\/li>\n<\/ul>/)
  assert.match(result, /<ul><li>Artist C \(Aug 1\)<\/li><\/ul>/)
})

test('mutateConcertEntryHtml recognizes a plain Future Concerts heading from Apple Notes', () => {
  const liveStyleHtml = concertsHtml.replace('<div><b>Future Concerts</b><br></div>', '<div>Future Concerts</div>')
  const result = mutateConcertEntryHtml(liveStyleHtml, { action: 'create', section: 'futureConcerts', raw: 'Artist E (Sep 10)' })

  assert.match(result, /<div>Future Concerts<\/div>\n<ul><li>Artist C \(Aug 1\)<\/li><li>Artist E \(Sep 10\)<\/li>/)
})
