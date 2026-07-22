import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeLineSeparators,
  normalizeNoteRecord,
  stripHtmlToText,
} from '../src/notes/index.mjs'

test('normalizeLineSeparators converts Apple line separator characters', () => {
  assert.equal(normalizeLineSeparators('A\u2028B\u2029C\rD'), 'A\nB\nCD')
})

test('stripHtmlToText preserves line-oriented note structure', () => {
  const html = '<div><h1>Concerts</h1></div><div><b>Want to see</b><br></div><ul><li>Arcy Drive</li><li>Bazzi</li></ul>'
  const text = stripHtmlToText(html)
  const lines = text.split('\n').filter(Boolean)

  assert.deepEqual(lines, ['Concerts', 'Want to see', 'Arcy Drive', 'Bazzi'])
})

test('normalizeNoteRecord produces normalized name and bodyText', () => {
  const record = normalizeNoteRecord({
    name: 'Test_ABCD1234\u2028\u2028Preview',
    bodyHtml: '<div>Test_ABCD1234\u2028\u2028This note is a test.</div>',
  })

  assert.equal(record.name, 'Test_ABCD1234\n\nPreview')
  assert.equal(record.bodyText, 'Test_ABCD1234\n\nThis note is a test.')
})
