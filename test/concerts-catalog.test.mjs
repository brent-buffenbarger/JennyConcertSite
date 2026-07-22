import test from 'node:test'
import assert from 'node:assert/strict'

import { buildConcertsCatalogFromExport, parseConcertEntry } from '../src/notes/index.mjs'

test('parseConcertEntry extracts rating and parenthetical metadata', () => {
  assert.deepEqual(parseConcertEntry('Arlie ❤️ (knee was tough)', 'seen', 0), {
    index: 0,
    raw: 'Arlie ❤️ (knee was tough)',
    artist: 'Arlie',
    status: 'seen',
    rating: 'love',
    notes: 'knee was tough',
    dateText: null,
    locationText: null,
    parsed: {
      date: null,
      venue: null,
      city: null,
    },
  })
})

test('parseConcertEntry extracts date and location hints from parenthetical text', () => {
  assert.deepEqual(parseConcertEntry('Rainbow kitten Surprise (July 25 CO)', 'seen', 3), {
    index: 3,
    raw: 'Rainbow kitten Surprise (July 25 CO)',
    artist: 'Rainbow kitten Surprise',
    status: 'seen',
    rating: null,
    notes: null,
    dateText: 'July 25',
    locationText: 'CO',
    parsed: {
      date: null,
      venue: null,
      city: null,
    },
  })
})

test('parseConcertEntry extracts structured seen fields and normalizes numeric dates', () => {
  assert.deepEqual(parseConcertEntry('Arlie - 04/05/2025 - Permanent Records Roadhouse - ❤️ - knee was tough', 'seen', 4), {
    index: 4,
    raw: 'Arlie - 04/05/2025 - Permanent Records Roadhouse - ❤️ - knee was tough',
    artist: 'Arlie',
    status: 'seen',
    rating: 'love',
    notes: 'knee was tough',
    dateText: '04/05/2025',
    locationText: 'Permanent Records Roadhouse',
    parsed: {
      date: '2025-04-05',
      venue: 'Permanent Records Roadhouse',
      city: null,
    },
  })
})

test('parseConcertEntry accepts a rating joined to the venue and an empty rating slot', () => {
  const joinedRating = parseConcertEntry('Barns Courtney - 03/26/2025 - Venice West ❤️‍🔥', 'seen', 0)
  assert.equal(joinedRating.artist, 'Barns Courtney')
  assert.equal(joinedRating.locationText, 'Venice West')
  assert.equal(joinedRating.rating, 'obsessed')

  const unrated = parseConcertEntry('Royel Otis - 07/08/2026 - Greek Theatre -', 'seen', 1)
  assert.equal(unrated.artist, 'Royel Otis')
  assert.equal(unrated.parsed.date, '2026-07-08')
  assert.equal(unrated.locationText, 'Greek Theatre')
  assert.equal(unrated.rating, null)
})

test('parseConcertEntry separates wishlist qualifiers and upcoming metadata', () => {
  const wishlist = parseConcertEntry('Glass Animals - With good tickets', 'want_to_see', 0)
  assert.equal(wishlist.artist, 'Glass Animals')
  assert.equal(wishlist.notes, 'With good tickets')

  const upcoming = parseConcertEntry('Sombr (Oct 10 Kia)', 'upcoming', 0)
  assert.equal(upcoming.artist, 'Sombr')
  assert.equal(upcoming.dateText, 'Oct 10')
  assert.equal(upcoming.locationText, 'Kia')
})

test('buildConcertsCatalogFromExport groups entries into meaningful sections', () => {
  const catalog = buildConcertsCatalogFromExport({
    exportedAt: '2026-07-17T22:49:42.751Z',
    notes: [
      {
        id: 'note-1',
        name: 'Concerts',
        account: 'iCloud',
        folder: 'Notes',
        createdAt: '2022-11-19T21:28:13.000Z',
        modifiedAt: '2026-07-11T12:57:25.000Z',
        bodyHtml: '<div>Concerts</div>',
        bodyText: 'Concerts\n\nWant to see\n\nArcy Drive\n\nHave seen\n\nPost Malone ❤️\n\nFuture Concerts\n\nRainbow Kitten Surprise (July 25 CO)',
      },
    ],
  })

  assert.equal(catalog.schemaVersion, 2)
  assert.equal(catalog.source.noteId, 'note-1')
  assert.equal(catalog.parsedCatalog.wantToSee.length, 1)
  assert.equal(catalog.parsedCatalog.haveSeen.length, 1)
  assert.equal(catalog.parsedCatalog.futureConcerts.length, 1)
  assert.equal(catalog.parsedCatalog.wantToSee[0].artist, 'Arcy Drive')
  assert.equal(catalog.parsedCatalog.haveSeen[0].rating, 'love')
  assert.equal(catalog.parsedCatalog.futureConcerts[0].dateText, 'July 25')
  assert.equal(catalog.parsedCatalog.futureConcerts[0].locationText, 'CO')
})
