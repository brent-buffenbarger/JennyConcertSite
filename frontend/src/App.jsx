import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import leafletMarker2x from 'leaflet/dist/images/marker-icon-2x.png'
import leafletMarker from 'leaflet/dist/images/marker-icon.png'
import leafletMarkerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'

// Rewire Leaflet's default marker icons so they survive Vite's bundling.
// We use divIcon markers ourselves, but Leaflet references these internally for its own fallbacks.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: leafletMarker2x,
  iconUrl: leafletMarker,
  shadowUrl: leafletMarkerShadow,
})

import { clearAdminCredential, createConcertEntry, deleteConcertMedia, fetchConcertMedia, fetchConcertsCatalog, fetchConcertUploads, getAdminCredential, refreshConcertsCatalog, setAdminCredential, setArtistImage, updateConcertEntry, uploadConcertMedia } from './lib/api'
import { createConcertEnricher } from './lib/concert-enrichment'

const ratingRailStyle = {
  obsessed: 'bg-rating-favorite',
  love: 'bg-rating-love',
  like: 'bg-rating-like',
  disappointed: 'bg-rating-disappointed',
}

const ratingWeight = {
  obsessed: 4,
  love: 3,
  like: 2,
  disappointed: 1,
}

const collectionDetails = {
  seen: {
    eyebrow: 'The archive',
    title: 'Shows we remember',
    description: 'Every concert Jenny has been to, from all-time favorites to the ones that got away.',
    countLabel: 'shows',
    addLabel: 'Log a show',
    emptyEyebrow: 'No shows yet',
    emptyHeading: 'The archive is quiet',
    emptyBody: 'The first concert added here starts the record.',
  },
  upcoming: {
    eyebrow: 'On the calendar',
    title: 'What\u2019s next',
    description: 'Tickets in hand, plans forming, and the shows on the horizon.',
    countLabel: 'upcoming',
    addLabel: 'Add a show',
    emptyEyebrow: 'Nothing on deck',
    emptyHeading: 'The calendar is open',
    emptyBody: 'Add the next concert as soon as tickets land.',
  },
  wishlist: {
    eyebrow: 'The wish list',
    title: 'Artists to catch',
    description: 'The lineup Jenny is waiting for \u2014 dream shows and someday tours.',
    countLabel: 'wished-for',
    addLabel: 'Add an artist',
    emptyEyebrow: 'Nobody yet',
    emptyHeading: 'The wish list is empty',
    emptyBody: 'Add an artist whose next tour deserves a hard yes.',
  },
}

const sectionByCollection = {
  seen: 'haveSeen',
  upcoming: 'futureConcerts',
  wishlist: 'wantToSee',
}

const ratingEmoji = {
  obsessed: '❤️‍🔥',
  love: '❤️',
  like: '🤍',
  disappointed: '💔',
}

function dateInputToNoteDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${month}/${day}/${year}`
}

function editorValues(entry, collection) {
  if (!entry) return { artist: '', date: '', dateText: '', venue: '', rating: '', notes: '', imageUrl: '' }
  return {
    artist: entry.sourceArtist || entry.artist,
    date: collection === 'seen' ? entry.parsed?.date || '' : '',
    dateText: collection === 'upcoming' ? entry.dateText || '' : '',
    venue: entry.parsed?.venue || entry.locationText || '',
    rating: collection === 'seen' ? entry.rating || '' : '',
    notes: entry.notes || '',
    imageUrl: entry.artistMedia?.rightsClass === 'user-provided' ? entry.artistMedia.imageUrl : '',
  }
}

function buildConcertEntryRaw(collection, values) {
  const artist = values.artist.trim()
  const venue = values.venue.trim()
  const notes = values.notes.trim()
  if (!artist) throw new Error('Artist is required.')

  if (collection === 'wishlist') return notes ? `${artist} - ${notes}` : artist
  if (collection === 'upcoming') {
    const details = [values.dateText.trim(), venue].filter(Boolean).join(' ')
    return details ? `${artist} (${details})` : artist
  }
  if (venue && !values.date) throw new Error('Add a date when including a venue for a concert you have seen.')

  const emoji = ratingEmoji[values.rating] || ''
  if (!values.date) {
    const reaction = emoji ? ` ${emoji}` : ''
    return `${artist}${reaction}${notes ? ` (${notes})` : ''}`
  }

  const parts = [artist, dateInputToNoteDate(values.date), venue, emoji]
  if (notes) parts.push(notes)
  return parts.join(' - ').trim()
}

function entriesForSection(catalog, section) {
  return catalog?.parsedCatalog?.[section] || []
}

function normalizeMediaTag(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function concertMediaDate(entry) {
  return entry?.parsed?.date || entry?.dateText || null
}

function uploadsForConcert(entry, uploads) {
  if (!entry) return []
  const artistKeys = new Set([entry.artist, entry.sourceArtist].filter(Boolean).map(normalizeMediaTag))
  const date = concertMediaDate(entry)
  return uploads.filter((upload) => artistKeys.has(normalizeMediaTag(upload.artist)) && upload.date === date)
}

function formatMomentDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || 'Date not added'
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
}

function loadVideoPreview(event) {
  const video = event.currentTarget
  if (video.currentTime || !Number.isFinite(video.duration) || video.duration <= 0) return
  video.currentTime = Math.min(0.25, video.duration * 0.1)
}

const monthNumber = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

function matchesQuery(entry, query) {
  if (!query) return true
  return [entry.artist, entry.sourceArtist, entry.concertName, entry.dateLabel, entry.venueName, entry.venueCity, entry.notes, entry.raw]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query.toLowerCase())
}

function matchesDetailsFilter(entry, filter) {
  if (filter === 'date') return Boolean(entry.dateText)
  if (filter === 'venue') return Boolean(entry.venueName)
  if (filter === 'notes') return Boolean(entry.notes)
  if (filter === 'photos') return Boolean(entry.artistMedia || entry.venueMedia)
  if (filter === 'needs-details') return !entry.dateText || !entry.venueName
  return true
}

function dateSortValue(entry) {
  if (entry.parsed?.date) return Number(entry.parsed.date.replaceAll('-', ''))
  if (!entry.dateText) return Number.POSITIVE_INFINITY
  const match = entry.dateText.toLowerCase().match(/^([a-z]+)\s+(\d{1,2})/)
  if (!match || !monthNumber[match[1]]) return Number.POSITIVE_INFINITY
  return monthNumber[match[1]] * 32 + Number(match[2])
}

function sortEntries(entries, sort) {
  return [...entries].sort((left, right) => {
    if (sort === 'note-desc') return right.index - left.index
    if (sort === 'artist') return left.artist.localeCompare(right.artist)
    if (sort === 'rating-desc') return (ratingWeight[right.rating] || 0) - (ratingWeight[left.rating] || 0) || left.index - right.index
    if (sort === 'rating-asc') return (ratingWeight[left.rating] || 0) - (ratingWeight[right.rating] || 0) || left.index - right.index
    if (sort === 'date') return dateSortValue(left) - dateSortValue(right) || left.index - right.index
    return left.index - right.index
  })
}

function ConcertCard({ entry, momentCount, onOpen, onOpenMoments }) {
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const isSeen = entry.status === 'seen'
  const isUpcoming = entry.status === 'upcoming'
  const isWishlist = entry.status === 'wishlist'
  const hasArtistImage = entry.imageType === 'artist' && failedImageUrl !== entry.imageUrl
  const imageUrl = hasArtistImage ? entry.imageUrl : entry.posterUrl
  const titleId = `${entry.status}-concert-${entry.index}-title`
  const canHaveMoments = (isSeen || isUpcoming) && Boolean(concertMediaDate(entry))
  const dateline = entry.dateLabel !== 'Date not added yet' ? entry.dateLabel : isUpcoming ? 'Date TBD' : isWishlist ? 'Someday' : 'Undated'
  const actionLabel = isUpcoming ? 'See the plans' : isWishlist ? 'About this artist' : entry.notes ? 'Read the memory' : 'Open the show'

  return (
    <article
      aria-labelledby={titleId}
      className="group relative flex h-full flex-col overflow-hidden rounded-card bg-surface transition-shadow duration-300 hover:shadow-card-hover"
    >
      <div className={`relative overflow-hidden bg-surface-muted ${hasArtistImage ? 'aspect-[4/5]' : 'aspect-[4/5]'}`}>
        <img src={imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={hasArtistImage ? () => setFailedImageUrl(entry.imageUrl) : undefined} />
        {hasArtistImage ? (
          <>
            <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-ink via-ink/60 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5">
              {!isWishlist ? <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-canvas/80">{dateline}</p> : null}
              <h3 id={titleId} className={`font-display uppercase leading-[0.9] text-canvas ${isWishlist ? 'text-[2.75rem] sm:text-[3.25rem]' : 'mt-1.5 text-[2.5rem] sm:text-5xl'}`}>{entry.artist}</h3>
              {entry.venueName ? <p className="mt-1.5 text-sm font-medium text-canvas/85">{entry.venueName}{entry.venueCity ? <span className="text-canvas/60"> &middot; {entry.venueCity}</span> : null}</p> : null}
            </div>
            <a href={entry.artistMedia.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Photo source: ${entry.artistMedia.creator}, ${entry.artistMedia.licenseName}; opens in a new tab`} className="absolute right-3 top-3 inline-flex h-8 items-center rounded-full bg-ink/70 px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-canvas backdrop-blur-sm hover:bg-ink/90">
              Photo <span className="ml-1" aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        ) : <h3 id={titleId} className="sr-only">{entry.artist}</h3>}

        {isSeen && entry.ratingEmoji ? (
          <span className={`absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full shadow-card ring-1 ${entry.rating === 'like' ? 'bg-ink ring-ink/30' : 'bg-canvas/95 ring-ink/10'}`} aria-label={entry.ratingLabel} title={entry.ratingLabel}>
            <span aria-hidden="true" className="block translate-y-[1px] text-[1.4rem] leading-none">{entry.ratingEmoji}</span>
          </span>
        ) : null}

        {isUpcoming && entry.parsed?.date ? (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-canvas/95 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-accent ring-1 ring-accent/20">
            Coming up
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
        {!hasArtistImage ? (
          <div>
            {!isWishlist ? <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-accent">{dateline}</p> : null}
            {entry.venueName ? <p className="mt-1 text-sm text-ink-muted">{entry.venueName}{entry.venueCity ? <span> &middot; {entry.venueCity}</span> : null}</p> : null}
          </div>
        ) : null}

        {entry.notes ? (
          <blockquote className="line-clamp-3 border-l-2 border-accent pl-3 font-serif text-[1.0625rem] italic leading-[1.5] text-ink sm:text-lg">
            <span className="mr-0.5 text-accent" aria-hidden="true">&ldquo;</span>{entry.notes}<span className="ml-0.5 text-accent" aria-hidden="true">&rdquo;</span>
          </blockquote>
        ) : null}

        {(entry.venueTypeLabel || entry.venueNeighborhood) && !isWishlist ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth="1.5">
              <path d="M8 14s5-4.5 5-8.5A5 5 0 0 0 3 5.5C3 9.5 8 14 8 14Z" />
              <circle cx="8" cy="6" r="1.75" />
            </svg>
            <span className="truncate">
              {entry.venueTypeLabel ? <span className="font-medium text-ink">{entry.venueTypeLabel}</span> : null}
              {entry.venueTypeLabel && entry.venueNeighborhood ? <span> in </span> : null}
              {entry.venueNeighborhood || (!entry.venueTypeLabel ? entry.venueCity : '')}
            </span>
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <button
            type="button"
            onClick={() => onOpen(entry)}
            aria-label={`${actionLabel} for ${entry.artist}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink transition hover:text-primary"
          >
            <span>{actionLabel}</span>
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
          </button>
          {canHaveMoments ? (
            <button
              type="button"
              onClick={() => onOpenMoments(entry)}
              aria-label={`${momentCount ? `${momentCount} photos and videos` : 'Add photos or videos'} for ${entry.artist}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="11" r="2" />
                <path d="m5 18 4-4 3 2 4-4 3 3" />
              </svg>
              {momentCount ? <span className="tabular-nums">{momentCount}</span> : <span>Add photos</span>}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function ConcertListRow({ entry, displayIndex, momentCount, onOpen, onOpenMoments }) {
  const isSeen = entry.status === 'seen'
  const isUpcoming = entry.status === 'upcoming'
  const canHaveMoments = (isSeen || isUpcoming) && Boolean(concertMediaDate(entry))
  const titleId = `list-${entry.status}-concert-${entry.index}-title`
  const venue = [entry.venueName, entry.venueCity].filter(Boolean).join(', ')
  const rowNumber = String(displayIndex + 1).padStart(2, '0')
  const railStyle = isSeen ? ratingRailStyle[entry.rating] || '' : ''

  return (
    <article aria-labelledby={titleId} className="group relative grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border py-5 lg:grid-cols-[3.5rem_3rem_minmax(0,1.4fr)_minmax(0,1fr)_9rem_auto] lg:gap-x-6 lg:py-6">
      <span aria-hidden="true" className="col-start-1 row-span-2 self-center font-display text-3xl italic tabular-nums text-ink-muted/40 transition-colors duration-200 group-hover:text-ink lg:text-[2.5rem]">{rowNumber}</span>

      {isSeen && entry.ratingEmoji ? (
        <span className={`hidden lg:col-start-2 lg:row-span-2 lg:flex lg:h-11 lg:w-11 lg:items-center lg:justify-center lg:self-center lg:justify-self-center lg:rounded-full lg:ring-1 ${entry.rating === 'like' ? 'lg:bg-ink lg:ring-ink/30' : 'lg:bg-canvas lg:ring-border'}`} aria-label={entry.ratingLabel} title={entry.ratingLabel}>
          <span aria-hidden="true" className="block translate-y-[1px] text-2xl leading-none">{entry.ratingEmoji}</span>
        </span>
      ) : (
        <span aria-hidden="true" className={`hidden lg:col-start-2 lg:row-span-2 lg:block lg:h-8 lg:w-1 lg:self-center lg:justify-self-center ${railStyle || 'bg-transparent'}`} />
      )}

      <div className="col-start-2 row-start-1 flex min-w-0 items-baseline gap-2 transition-transform duration-200 group-hover:translate-x-1 lg:col-start-3 lg:row-start-1">
        {isSeen && entry.ratingEmoji ? <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center lg:hidden" aria-hidden="true"><span className="block translate-y-[1px] text-xl leading-none">{entry.ratingEmoji}</span></span> : null}
        <h3 id={titleId} className="relative min-w-0 flex-1 font-display text-[1.75rem] uppercase leading-none text-ink lg:text-[2rem]">
          <span className="block truncate">{entry.artist}</span>
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-1 left-0 h-[2px] w-full max-w-[8rem] origin-left scale-x-0 bg-accent transition-transform duration-300 ease-out group-hover:scale-x-100" />
        </h3>
      </div>
      <p className="col-start-2 row-start-2 min-w-0 truncate text-sm text-ink-muted transition-transform duration-200 group-hover:translate-x-1 lg:col-start-3 lg:row-start-2" title={venue}>
        <span className="lg:hidden font-semibold text-ink"><time dateTime={entry.parsed?.date || undefined}>{entry.dateLabel}</time></span>
        {venue ? <><span className="lg:hidden text-ink-muted/60"> &middot; </span>{venue}</> : null}
        <span className="hidden lg:inline">{venue || (isUpcoming ? 'Venue TBD' : 'Venue not recorded')}</span>
      </p>

      <p className="hidden text-sm font-medium text-ink lg:col-start-4 lg:row-span-2 lg:block lg:self-center"><time dateTime={entry.parsed?.date || undefined}>{entry.dateLabel}</time></p>

      <div className="col-start-3 row-span-2 flex items-center gap-1.5 self-center lg:col-start-5 lg:row-span-2 lg:col-span-2 lg:justify-end">
        {canHaveMoments ? (
          <button type="button" onClick={() => onOpenMoments(entry)} aria-label={`${momentCount ? `${momentCount} photos and videos` : 'Add photos or videos'} for ${entry.artist}`} className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border border-border px-2 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="m5 18 4-4 3 2 4-4 3 3" />
            </svg>
            {momentCount ? <span className="tabular-nums">{momentCount}</span> : null}
          </button>
        ) : null}
        <button type="button" onClick={() => onOpen(entry)} aria-label={`Read entry for ${entry.artist}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-canvas transition hover:bg-primary">
          Read <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
        </button>
      </div>
    </article>
  )
}

function EntryEditor({ editor, isSaving, error, onClose, onSave, backgroundRef }) {
  const dialogRef = useRef(null)
  const firstInputRef = useRef(null)
  const [values, setValues] = useState(() => editorValues(editor.entry, editor.collection))
  const [validationError, setValidationError] = useState('')
  const [savingSeconds, setSavingSeconds] = useState(0)
  const isEdit = editor.mode === 'edit'
  const collectionNoun = editor.collection === 'seen' ? 'show' : editor.collection === 'upcoming' ? 'upcoming show' : 'wishlist artist'
  const originalImageUrl = editor.entry?.artistMedia?.rightsClass === 'user-provided' ? editor.entry.artistMedia.imageUrl : ''

  useEffect(() => {
    if (!isSaving) {
      setSavingSeconds(0)
      return undefined
    }
    const startedAt = Date.now()
    const interval = window.setInterval(() => setSavingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(interval)
  }, [isSaving])

  useEffect(() => {
    const previousFocus = document.activeElement
    const background = backgroundRef.current
    const previousAriaHidden = background?.getAttribute('aria-hidden')
    const wasInert = background?.inert
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (background) {
      background.inert = true
      background.setAttribute('aria-hidden', 'true')
    }
    firstInputRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isSaving) onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (background) {
        background.inert = wasInert
        if (previousAriaHidden === null) background.removeAttribute('aria-hidden')
        else background.setAttribute('aria-hidden', previousAriaHidden)
      }
      previousFocus?.focus()
    }
  }, [backgroundRef, isSaving, onClose])

  function change(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  function submit(event) {
    event.preventDefault()
    try {
      const raw = buildConcertEntryRaw(editor.collection, values)
      const entryChanged = !isEdit || raw !== editor.entry.raw.trim()
      const imageUrl = values.imageUrl.trim()
      const imageChanged = Boolean(imageUrl && imageUrl !== originalImageUrl)
      if (isEdit && !entryChanged && !imageChanged) throw new Error('Change at least one field before saving.')
      setValidationError('')
      onSave({ raw, artist: values.artist.trim(), imageUrl: imageChanged ? imageUrl : '', entryChanged })
    } catch (caughtError) {
      setValidationError(caughtError.message)
    }
  }

  const inputClass = 'mt-2 h-12 w-full rounded-control border border-control-border bg-surface px-3 text-base text-ink'
  const savingStage = savingSeconds < 5
    ? 'Writing to Apple Notes\u2026'
    : savingSeconds < 12
      ? 'Refreshing the archive\u2026'
      : savingSeconds < 20
        ? 'Pulling artwork\u2026'
        : 'Almost done. Thanks for waiting\u2026'

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink/80 md:items-center md:p-6" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onClose()
    }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="entry-editor-title" className="flex h-[100dvh] w-full max-w-2xl flex-col overflow-y-auto bg-surface shadow-dialog md:h-auto md:max-h-[92dvh] md:rounded-dialog">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-canvas pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{isEdit ? 'Revising an entry' : 'A new entry'}</p>
            <h2 id="entry-editor-title" className="mt-1 font-display text-3xl uppercase leading-none text-ink sm:text-4xl">{isEdit ? `Edit ${collectionNoun}` : `New ${collectionNoun}`}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close editor" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl leading-none text-ink transition hover:border-control-border disabled:cursor-wait">&times;</button>
        </div>

        <form onSubmit={submit} aria-busy={isSaving} className="flex flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 sm:p-7">
          <fieldset disabled={isSaving} className="grid gap-4 sm:grid-cols-2 sm:gap-5 disabled:cursor-wait">
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold text-ink">Artist</span>
              <input ref={firstInputRef} required value={values.artist} onChange={change('artist')} className={inputClass} placeholder="Artist or band name" />
            </label>

            {editor.collection === 'seen' ? (
              <>
                <label>
                  <span className="text-sm font-semibold text-ink">Date <span className="font-normal text-ink-muted">(optional)</span></span>
                  <input type="date" value={values.date} onChange={change('date')} className={inputClass} />
                </label>
                <label>
                  <span className="text-sm font-semibold text-ink">Venue <span className="font-normal text-ink-muted">(optional)</span></span>
                  <input value={values.venue} onChange={change('venue')} className={inputClass} placeholder="Venue name" />
                </label>
                <label>
                  <span className="text-sm font-semibold text-ink">Verdict</span>
                  <select value={values.rating} onChange={change('rating')} className={inputClass}>
                    <option value="">Not rated yet</option>
                    <option value="obsessed">All-time favorite</option>
                    <option value="love">Loved it</option>
                    <option value="like">Liked it</option>
                    <option value="disappointed">Not a favorite</option>
                  </select>
                </label>
              </>
            ) : null}

            {editor.collection === 'upcoming' ? (
              <>
                <label>
                  <span className="text-sm font-semibold text-ink">Date or timing <span className="font-normal text-ink-muted">(optional)</span></span>
                  <input value={values.dateText} onChange={change('dateText')} className={inputClass} placeholder="Sep 29 or 30" />
                </label>
                <label>
                  <span className="text-sm font-semibold text-ink">Venue or location <span className="font-normal text-ink-muted">(optional)</span></span>
                  <input value={values.venue} onChange={change('venue')} className={inputClass} placeholder="Kia Forum or CO" />
                </label>
              </>
            ) : null}

            {editor.collection !== 'upcoming' ? (
              <label className={editor.collection === 'wishlist' ? 'sm:col-span-2' : ''}>
                <span className="text-sm font-semibold text-ink">{editor.collection === 'wishlist' ? 'Why this artist' : 'The memory'} <span className="font-normal text-ink-muted">(optional)</span></span>
                <textarea value={values.notes} onChange={change('notes')} rows="3" className="mt-2 w-full rounded-control border border-control-border bg-surface px-3 py-3 text-base text-ink" placeholder={editor.collection === 'wishlist' ? 'What makes them a hard yes?' : 'What do you want to remember?'} />
              </label>
            ) : null}

            <label className="sm:col-span-2">
              <span className="text-sm font-semibold text-ink">Custom artist photo <span className="font-normal text-ink-muted">(optional)</span></span>
              <span className="mt-1 block text-sm leading-5 text-ink-muted">Paste an image URL to override the automatic artwork.</span>
              <input type="url" value={values.imageUrl} onChange={change('imageUrl')} className={inputClass} placeholder="https://example.com/artist.jpg" />
            </label>
          </fieldset>

          {isSaving ? (
            <div role="status" aria-live="polite" className="mt-6 flex gap-4 border-y border-border bg-canvas px-4 py-5 text-ink">
              <div className="flex h-10 shrink-0 items-end gap-1" aria-hidden="true">
                <span className="h-5 w-1.5 animate-pulse rounded-full bg-accent" />
                <span className="h-9 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                <span className="h-7 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
                <span className="h-4 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:450ms]" />
              </div>
              <div>
                <p className="font-semibold">{savingStage}</p>
                <p className="mt-1 text-sm leading-5 text-ink-muted">This can take a moment. Keep the window open.</p>
                <p aria-hidden="true" className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-accent">{savingSeconds}s</p>
              </div>
            </div>
          ) : null}

          {validationError || error ? <p role="alert" className="mt-5 rounded-control border border-accent bg-surface px-4 py-3 text-sm font-semibold text-accent">{validationError || error}</p> : null}
          <p className="mt-5 text-sm leading-5 text-ink-muted">Everything here writes back to the shared note. Removing an entry happens there, not on the site.</p>

          <div className="mt-auto flex flex-col-reverse gap-2 border-t border-border pt-5 sm:mt-7 sm:flex-row sm:justify-end sm:gap-3 sm:pt-6">
            <button type="button" onClick={onClose} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-[15px] font-medium text-ink-muted transition hover:border-control-border hover:text-ink disabled:cursor-wait">Cancel</button>
            <button type="submit" disabled={isSaving} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-canvas transition hover:bg-primary disabled:cursor-wait disabled:bg-ink-muted">
              {isSaving ? 'Saving\u2026' : isEdit ? 'Save changes' : 'Save entry'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function AdminSignIn({ open, message, onClose, onSubmit, backgroundRef }) {
  const dialogRef = useRef(null)
  const firstInputRef = useRef(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const background = backgroundRef?.current
    const previousInert = background?.inert
    const previousAriaHidden = background?.getAttribute('aria-hidden')
    document.body.style.overflow = 'hidden'
    if (background) {
      background.inert = true
      background.setAttribute('aria-hidden', 'true')
    }
    firstInputRef.current?.focus()
    function keyHandler(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('keydown', keyHandler)
      document.body.style.overflow = previousOverflow
      if (background) {
        background.inert = previousInert
        if (previousAriaHidden === null) background.removeAttribute('aria-hidden')
        else background.setAttribute('aria-hidden', previousAriaHidden)
      }
      previousFocus?.focus()
    }
  }, [open, onClose, backgroundRef])

  if (!open) return null

  function submit(event) {
    event.preventDefault()
    if (!username.trim() || !password) return
    onSubmit(username.trim(), password)
    setPassword('')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/80 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-sign-in-title" className="w-full max-w-sm rounded-dialog bg-surface p-6 shadow-dialog sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Editor access</p>
        <h2 id="admin-sign-in-title" className="mt-1 font-display text-3xl uppercase leading-none text-ink">Sign in to edit</h2>
        <p className="mt-3 text-sm text-ink-muted">{message || 'Editing the concert log requires the shared password.'}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-ink">Username</span>
            <input
              ref={firstInputRef}
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-2 h-11 w-full rounded-control border border-control-border bg-surface px-3 text-base text-ink"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-control border border-control-border bg-surface px-3 text-base text-ink"
              required
            />
          </label>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-[15px] font-medium text-ink-muted transition hover:border-control-border hover:text-ink">
              Cancel
            </button>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-[15px] font-medium text-canvas transition hover:bg-primary">
              Save credentials
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function SyncProgress() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const interval = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const stage = seconds < 4
    ? 'Reading the shared note\u2026'
    : seconds < 10
      ? 'Rebuilding the archive\u2026'
      : seconds < 18
        ? 'Checking artist details\u2026'
        : 'Refreshing artwork\u2026'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-canvas px-5 py-10" role="status" aria-live="polite" aria-busy="true">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-20 w-20 items-end justify-center gap-1.5" aria-hidden="true">
          <span className="h-8 w-1.5 animate-pulse rounded-full bg-accent" />
          <span className="h-16 w-1.5 animate-pulse rounded-full bg-ink [animation-delay:150ms]" />
          <span className="h-11 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
          <span className="h-6 w-1.5 animate-pulse rounded-full bg-ink [animation-delay:450ms]" />
        </div>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Syncing</p>
        <h2 className="mt-4 font-display text-5xl uppercase leading-[0.9] text-ink sm:text-7xl">{stage}</h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-7 text-ink-muted">Apple Notes can take a moment. This page retries transient read failures automatically \u2014 keep it open.</p>
        <p aria-hidden="true" className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted tabular-nums">{seconds}s elapsed</p>
      </div>
    </div>
  )
}

function ConcertMoments({ entry, uploads, onUpload, onDelete }) {
  const inputRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const date = concertMediaDate(entry)
  const selected = uploads.find((upload) => upload.id === selectedId) || uploads[0] || null

  useEffect(() => {
    if (!uploads.length) setSelectedId(null)
    else if (!uploads.some((upload) => upload.id === selectedId)) setSelectedId(uploads[0].id)
  }, [selectedId, uploads])

  async function uploadFiles(event) {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!files.length) return
    setUploadError('')
    setIsUploading(true)
    try {
      const added = await onUpload(entry, files)
      if (added.length) setSelectedId(added[0].id)
    } catch (caughtError) {
      setUploadError(caughtError.message)
    } finally {
      setIsUploading(false)
    }
  }

  async function deleteSelected() {
    if (!selected || isDeleting) return
    setUploadError('')
    setIsDeleting(true)
    try {
      await onDelete(selected)
    } catch (caughtError) {
      setUploadError(caughtError.message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section aria-labelledby="concert-moments-title" className="py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Lives here on the site</p>
          <h3 id="concert-moments-title" className="mt-1 font-display text-3xl uppercase leading-none text-ink sm:text-4xl">The unofficial record</h3>
          <p className="mt-2 text-sm text-ink-muted">{uploads.length ? `${uploads.length} ${uploads.length === 1 ? 'moment' : 'moments'} from this show.` : 'Nothing captured from this night yet.'}</p>
        </div>
        {date ? (
          <>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime" onChange={uploadFiles} className="sr-only" />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={isUploading} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-[15px] font-medium text-canvas transition hover:bg-primary disabled:cursor-wait disabled:bg-ink-muted">
              <span aria-hidden="true">&#43;</span>{isUploading ? 'Uploading\u2026' : 'Add a photo or video'}
            </button>
          </>
        ) : null}
      </div>

      {!date ? <p className="mt-4 rounded-control border border-border bg-canvas px-4 py-3 text-sm leading-5 text-ink-muted">Add a concert date before uploading, so each file stays attached to the right show.</p> : null}
      {uploadError ? <p role="alert" className="mt-4 rounded-control border border-accent px-4 py-3 text-sm font-semibold text-accent">{uploadError}</p> : null}

      {selected ? (
        <div className="mt-4 lg:mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-stretch lg:gap-5">
          <div className="aspect-video overflow-hidden rounded-card bg-ink shadow-card">
            {selected.mediaType === 'video' ? (
              <video key={selected.id} src={selected.url} controls playsInline preload="metadata" onLoadedMetadata={loadVideoPreview} className="h-full w-full object-contain" aria-label={selected.originalName} />
            ) : (
              <img src={selected.url} alt={`${entry.artist} concert upload`} className="h-full w-full object-contain" />
            )}
          </div>
          <div className="mt-3 border-t border-border pt-3 lg:mt-0 lg:flex lg:min-h-0 lg:flex-col lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="flex items-center justify-between gap-3 lg:block">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">Selected {selected.mediaType === 'video' ? 'video' : 'photo'}</p>
                <p className="mt-1 truncate text-sm font-semibold leading-5 text-ink" title={selected.originalName}>{selected.originalName}</p>
              </div>
              <button type="button" onClick={deleteSelected} disabled={!selected || isDeleting} className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-accent px-3 text-sm font-semibold text-accent transition hover:bg-header disabled:cursor-wait disabled:opacity-60 lg:hidden">{isDeleting ? 'Deleting…' : 'Delete'}</button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:mt-4 sm:grid-cols-4 lg:max-h-[15rem] lg:grid-cols-2 lg:content-start lg:overflow-y-auto" aria-label="Concert media thumbnails">
              {uploads.map((upload, index) => (
                <button key={upload.id} type="button" onClick={() => setSelectedId(upload.id)} aria-label={`View ${upload.mediaType} ${index + 1}: ${upload.originalName}`} aria-pressed={selected.id === upload.id} className={`relative aspect-[4/3] w-full overflow-hidden rounded-control border-2 bg-ink ${selected.id === upload.id ? 'border-accent' : 'border-transparent'}`}>
                  {upload.mediaType === 'video' ? (
                    <>
                      <video src={upload.url} muted playsInline preload="metadata" onLoadedMetadata={loadVideoPreview} className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/35 text-xl text-surface" aria-hidden="true">▶</span>
                    </>
                  ) : <img src={upload.url} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
            <div className="mt-2 hidden justify-end lg:mt-auto lg:flex lg:pt-4">
              <button type="button" onClick={deleteSelected} disabled={!selected || isDeleting} className="inline-flex min-h-11 items-center rounded-control border border-accent px-3 text-sm font-semibold text-accent transition hover:bg-header disabled:cursor-wait disabled:opacity-60">{isDeleting ? 'Deleting…' : 'Delete selected'}</button>
            </div>
          </div>
        </div>
      ) : date ? (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isUploading} className="mt-6 flex min-h-40 w-full flex-col items-center justify-center rounded-card border border-dashed border-border bg-canvas px-6 text-center transition hover:border-control-border hover:bg-surface-muted/40 disabled:cursor-wait">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your turn</span>
          <span className="mt-3 font-display text-4xl uppercase leading-none text-ink">Add the first shot</span>
          <span className="mt-3 max-w-sm text-sm leading-5 text-ink-muted">Drop in a photo or video from this show to start the record.</span>
        </button>
      ) : null}
    </section>
  )
}

function MomentsFeed({ uploads, onViewConcert }) {
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!selected) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selected])

  const photoCount = uploads.filter((upload) => upload.mediaType === 'image').length
  const videoCount = uploads.length - photoCount

  return (
    <section aria-labelledby="moments-feed-title">
      <div className="mb-6 flex flex-col gap-5 border-b border-border pb-5 sm:mb-8 sm:gap-6 sm:pb-6 lg:mb-10 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:pb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">From the crowd</p>
          <h2 id="moments-feed-title" className="mt-3 font-display text-[3rem] uppercase leading-[0.9] text-ink min-[400px]:text-[3.75rem] sm:mt-4 sm:text-[5rem] lg:text-[6rem]">Moments</h2>
          <p className="mt-4 max-w-xl text-base leading-6 text-ink-muted sm:text-lg sm:leading-7">Every photo and video, sorted by show. The unofficial record.</p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-muted lg:self-end">{photoCount} {photoCount === 1 ? 'photo' : 'photos'} &middot; {videoCount} {videoCount === 1 ? 'video' : 'videos'}</p>
      </div>

      {uploads.length ? (
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8 xl:grid-cols-3">
          {uploads.map((upload) => (
            <article key={upload.id} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-card bg-surface">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink">
                {upload.mediaType === 'video' ? (
                  <video src={upload.url} controls playsInline preload="metadata" onLoadedMetadata={loadVideoPreview} className="h-full w-full object-contain" aria-label={`${upload.artist} concert video`} />
                ) : (
                  <button type="button" onClick={() => setSelected(upload)} className="block h-full w-full" aria-label={`Open ${upload.artist} concert photo from ${formatMomentDate(upload.date)}`}>
                    <img src={upload.url} alt={`${upload.artist} concert on ${formatMomentDate(upload.date)}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  </button>
                )}
                <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-canvas/95 px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ink">{upload.mediaType === 'video' ? 'Video' : 'Photo'}</span>
              </div>
              <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-4 sm:px-5">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-accent">{formatMomentDate(upload.date)}</p>
                  <p className="mt-1 font-display text-2xl uppercase leading-[0.95] text-ink sm:text-3xl">{upload.artist}</p>
                </div>
                <button type="button" onClick={() => onViewConcert(upload)} className="mt-auto inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-ink transition hover:text-primary">
                  Open the show <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="px-4 py-20 text-center sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Nothing captured yet</p>
          <p className="mx-auto mt-4 max-w-2xl font-display text-4xl uppercase leading-[0.95] text-ink sm:text-5xl lg:text-6xl">Waiting on the encore</p>
          <p className="mx-auto mt-4 max-w-md text-base leading-7 text-ink-muted">Open any show and use its Photos tab to drop in the first moment.</p>
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/95 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={`${selected.artist} concert photo`} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelected(null)
        }}>
          <div className="flex max-h-full w-full max-w-6xl flex-col">
            <div className="mb-3 flex items-center justify-between gap-4 text-surface">
              <div>
                <p className="font-semibold">{selected.artist}</p>
                <p className="text-sm text-surface-muted">{formatMomentDate(selected.date)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="flex h-11 w-11 items-center justify-center rounded-full border border-surface/60 text-3xl" aria-label="Close photo viewer">×</button>
            </div>
            <img src={selected.url} alt={`${selected.artist} concert on ${formatMomentDate(selected.date)}`} className="h-[calc(100dvh-7rem)] w-full object-contain" />
          </div>
        </div>
      ) : null}
    </section>
  )
}

// Region presets for the quick-zoom chip strip.
const atlasRegions = [
  { id: 'all', name: 'Everywhere', center: [39, -96], zoom: 4 },
  { id: 'la', name: 'LA basin', center: [34.04, -118.28], zoom: 11 },
  { id: 'slc', name: 'Utah', center: [40.72, -111.97], zoom: 11 },
  { id: 'vegas', name: 'Vegas', center: [36.12, -115.17], zoom: 12 },
  { id: 'stl', name: 'St. Louis', center: [38.71, -90.49], zoom: 12 },
]

// Deterministic pin icons rendered as HTML for L.divIcon.
function buildVenuePinIcon(isSelected) {
  const fill = isSelected ? '#9e3e61' : '#1f2a33'
  const ring = '#fffdf9'
  return L.divIcon({
    className: 'atlas-pin',
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${fill};box-shadow:0 0 0 2px ${ring},0 1px 3px rgba(0,0,0,0.25)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -12],
  })
}

// Cluster bubble icon that matches the design language.
function buildClusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count < 5 ? 32 : count < 15 ? 38 : 44
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:#1f2a33;color:#fffdf9;font-family:'Source Sans 3',ui-sans-serif,system-ui,sans-serif;font-weight:600;font-size:13px;box-shadow:0 0 0 3px #fffdf9,0 4px 10px rgba(0,0,0,0.2)">${count}</div>`,
    className: 'atlas-cluster',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function buildAtlasVenues(collections) {
  const venuesByName = new Map()
  for (const entry of [...collections.seen, ...collections.upcoming]) {
    if (!entry.venueName || entry.venueLat == null || entry.venueLng == null) continue
    const key = entry.venueName
    const record = venuesByName.get(key) || {
      id: `venue-${entry.venueName}`,
      name: entry.venueName,
      city: entry.venueCity,
      neighborhood: entry.venueNeighborhood,
      typeLabel: entry.venueTypeLabel,
      lat: entry.venueLat,
      lng: entry.venueLng,
      media: entry.venueMedia,
      mark: entry.venueMark,
      mapUrl: entry.venueMapUrl,
      shows: [],
    }
    record.shows.push(entry)
    venuesByName.set(key, record)
  }
  for (const record of venuesByName.values()) {
    record.shows.sort((left, right) => (right.parsed?.date || '').localeCompare(left.parsed?.date || ''))
  }
  return [...venuesByName.values()].sort((left, right) => right.shows.length - left.shows.length)
}

function ratingGlyph(rating) {
  return rating === 'obsessed' ? '\u2764\uFE0F\u200D\uD83D\uDD25'
    : rating === 'love' ? '\u2764\uFE0F'
    : rating === 'like' ? '\uD83E\uDD0D'
    : rating === 'disappointed' ? '\uD83D\uDC94'
    : null
}

function AtlasVenuePanel({ venue, onOpenEntry }) {
  const heading = venue.name
  return (
    <article aria-labelledby="atlas-venue-title" className="rounded-card bg-surface">
      <div className="overflow-hidden rounded-t-card">
        {venue.media ? (
          <img src={venue.media.imageUrl} alt="" className="aspect-[16/9] h-full w-full object-cover" />
        ) : venue.mark ? (
          <img src={venue.mark} alt="" className="aspect-[16/10] h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">The room</p>
        <h3 id="atlas-venue-title" className="mt-2 font-display text-3xl uppercase leading-none text-ink sm:text-4xl">{heading}</h3>
        {venue.typeLabel || venue.neighborhood ? (
          <p className="mt-3 text-sm text-ink">
            {venue.typeLabel ? <span>{venue.typeLabel}</span> : null}
            {venue.typeLabel && venue.neighborhood ? <span className="text-ink-muted"> in </span> : null}
            {venue.neighborhood ? <span>{venue.neighborhood}</span> : null}
          </p>
        ) : null}
        {venue.city ? <p className="mt-1 text-sm text-ink-muted">{venue.city}</p> : null}

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">{venue.shows.length} {venue.shows.length === 1 ? 'show' : 'shows'} logged</p>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {venue.shows.map((show) => {
            const glyph = ratingGlyph(show.rating)
            return (
              <li key={`${show.status}-${show.index}`}>
                <button type="button" onClick={() => onOpenEntry(show)} className="group flex w-full items-center gap-3 py-3 text-left transition hover:text-primary">
                  {glyph ? (
                    <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
                      <span className="block translate-y-[1px] text-lg leading-none">{glyph}</span>
                    </span>
                  ) : (
                    <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-ink-muted/50">&middot;</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg uppercase leading-none text-ink group-hover:text-primary">{show.artist}</span>
                    <span className="mt-1 block truncate text-xs text-ink-muted">{show.dateLabel}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5">&rarr;</span>
                </button>
              </li>
            )
          })}
        </ul>

        {venue.mapUrl ? (
          <a href={venue.mapUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink">
            See it on the map <span className="ml-1.5" aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
        {venue.media ? <div className="mt-4"><MediaCredit media={venue.media} /></div> : null}
      </div>
    </article>
  )
}

// Imperative helper: any time this component's props change, fly the map there.
function AtlasMapController({ flyTo }) {
  const map = useMap()
  useEffect(() => {
    if (!flyTo) return
    map.flyTo(flyTo.center, flyTo.zoom, { duration: 0.75 })
  }, [map, flyTo])
  return null
}

function AtlasPage({ collections, onOpenEntry }) {
  const venues = useMemo(() => buildAtlasVenues(collections), [collections])
  const [selectedVenueId, setSelectedVenueId] = useState(venues[0]?.id || null)
  const selectedVenue = venues.find((v) => v.id === selectedVenueId) || venues[0] || null
  const totalShows = venues.reduce((total, v) => total + v.shows.length, 0)
  const [flyTarget, setFlyTarget] = useState(null)

  function flyToRegion(region) {
    setFlyTarget({ center: region.center, zoom: region.zoom, key: `region-${region.id}-${Date.now()}` })
  }

  function focusVenue(venue) {
    setSelectedVenueId(venue.id)
    setFlyTarget({ center: [venue.lat, venue.lng], zoom: 14, key: `venue-${venue.id}-${Date.now()}` })
  }

  const initialCenter = [39, -96]
  const initialZoom = 4

  return (
    <section aria-labelledby="atlas-title">
      <div className="mb-6 flex flex-col gap-5 border-b border-border pb-5 sm:mb-8 sm:gap-6 sm:pb-6 lg:mb-10 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:pb-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">The map</p>
          <h2 id="atlas-title" className="mt-3 font-display text-[3rem] uppercase leading-[0.9] text-ink min-[400px]:text-[3.75rem] sm:mt-4 sm:text-[5rem] lg:text-[6rem]">Atlas</h2>
          <p className="mt-4 max-w-xl text-base leading-6 text-ink-muted sm:text-lg sm:leading-7">Every venue Jenny has stepped inside, plotted on real streets. Zoom or pinch to spread out the LA basin \u2014 that\u2019s where most of the record lives.</p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-muted lg:self-end">{venues.length} venues &middot; {totalShows} shows</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0">
          <div className="atlas-map-wrapper h-[26rem] w-full overflow-hidden rounded-card border border-border sm:h-[32rem] lg:h-[36rem]">
            <MapContainer
              center={initialCenter}
              zoom={initialZoom}
              scrollWheelZoom
              className="h-full w-full"
              style={{ background: '#e3edf1' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
              <MarkerClusterGroup
                chunkedLoading
                showCoverageOnHover={false}
                spiderfyOnMaxZoom
                maxClusterRadius={45}
                iconCreateFunction={buildClusterIcon}
              >
                {venues.map((venue) => (
                  <Marker
                    key={venue.id}
                    position={[venue.lat, venue.lng]}
                    icon={buildVenuePinIcon(venue.id === selectedVenueId)}
                    eventHandlers={{
                      click: () => setSelectedVenueId(venue.id),
                    }}
                  />
                ))}
              </MarkerClusterGroup>
              <AtlasMapController flyTo={flyTarget} />
            </MapContainer>
          </div>

          {/* Region presets */}
          <div role="group" aria-label="Zoom to region" className="mt-4 flex flex-wrap gap-2">
            {atlasRegions.map((region) => (
              <button
                key={region.id}
                type="button"
                onClick={() => flyToRegion(region)}
                className="inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink"
              >
                {region.name}
              </button>
            ))}
          </div>

          {/* Venue directory: flat list of all venues, jump-to on click */}
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">All venues</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {venues.map((venue) => (
                <button
                  key={venue.id}
                  type="button"
                  onClick={() => focusVenue(venue)}
                  aria-pressed={venue.id === selectedVenueId}
                  className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm transition ${venue.id === selectedVenueId ? 'border-ink bg-ink text-canvas' : 'border-border bg-surface text-ink-muted hover:border-control-border hover:text-ink'}`}
                >
                  {venue.name}
                  <span className={`ml-1.5 text-xs tabular-nums ${venue.id === selectedVenueId ? 'text-canvas/70' : 'text-ink-muted/70'}`}>{venue.shows.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          {selectedVenue ? <AtlasVenuePanel venue={selectedVenue} onOpenEntry={onOpenEntry} /> : null}
        </div>
      </div>
    </section>
  )
}

function MediaCredit({ media }) {
  if (!media) return null
  return (
    <p className="border-t border-border bg-canvas px-4 py-2.5 text-xs leading-5 text-ink-muted">
      <a href={media.sourceUrl} target="_blank" rel="noreferrer" className="text-ink underline decoration-border underline-offset-2 hover:decoration-accent">&ldquo;{media.title}&rdquo;<span className="sr-only"> (source opens in a new tab)</span></a> &middot; {media.creator}
      {' \u00b7 '}
      <a href={media.licenseUrl} target="_blank" rel="noreferrer" className="text-ink underline decoration-border underline-offset-2 hover:decoration-accent">{media.licenseName}<span className="sr-only"> ({media.rightsClass === 'commons-licensed' ? 'license' : 'image terms'} open in a new tab)</span></a>
      {' \u00b7 '}{media.modifications}
    </p>
  )
}

function DetailModal({ entry, uploads, focusSection, onClose, onEdit, onUpload, onDeleteUpload, backgroundRef }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const [activeTab, setActiveTab] = useState(focusSection === 'moments' ? 'moments' : 'details')

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!entry) return undefined

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const background = backgroundRef.current
    const previousAriaHidden = background?.getAttribute('aria-hidden')
    const wasInert = background?.inert

    document.body.style.overflow = 'hidden'
    if (background) {
      background.inert = true
      background.setAttribute('aria-hidden', 'true')
    }
    closeRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (background) {
        background.inert = wasInert
        if (previousAriaHidden === null) background.removeAttribute('aria-hidden')
        else background.setAttribute('aria-hidden', previousAriaHidden)
      }
      previousFocus?.focus()
    }
  }, [backgroundRef, entry])

  if (!entry) return null

  const isSeen = entry.status === 'seen'
  const isUpcoming = entry.status === 'upcoming'
  const hasMomentsTab = isSeen || isUpcoming
  const hasArtistImage = entry.imageType === 'artist' && failedImageUrl !== entry.imageUrl
  const imageUrl = hasArtistImage ? entry.imageUrl : entry.posterUrl

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/75 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        aria-describedby="detail-context"
        className="relative h-[100dvh] w-full overflow-y-auto bg-surface shadow-dialog md:h-auto md:max-h-[92dvh] md:max-w-5xl md:rounded-dialog"
      >
        <div className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
          <div className="dialog-content-gutter flex min-h-14 items-center justify-between gap-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:min-h-16 md:py-3">
            <p id="detail-context" className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{isSeen ? 'A show remembered' : isUpcoming ? 'On the calendar' : 'On the wish list'}</p>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close entry"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl leading-none text-ink transition hover:border-control-border hover:bg-surface-muted"
            >
              &times;
            </button>
          </div>
          {hasMomentsTab ? (
            <div role="tablist" aria-label={`${entry.artist} concert views`} className="dialog-content-gutter flex gap-6">
              {[
                ['details', 'The entry'],
                ['moments', uploads.length ? `Photos \u00b7 ${uploads.length}` : 'Photos'],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  id={`${tab}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`${tab}-panel`}
                  tabIndex={activeTab === tab ? 0 : -1}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const nextTab = event.key === 'Home' ? 'details' : event.key === 'End' ? 'moments' : tab === 'details' ? 'moments' : 'details'
                    setActiveTab(nextTab)
                    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus())
                  }}
                  className={`min-h-11 border-b-2 px-1 pb-2 text-sm font-semibold transition min-[375px]:text-base ${activeTab === tab ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:border-border hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <h2 id="detail-title" className="sr-only">{entry.artist} concert details</h2>

        <div id="details-panel" role={hasMomentsTab ? 'tabpanel' : undefined} aria-labelledby={hasMomentsTab ? 'details-tab' : undefined} hidden={hasMomentsTab && activeTab !== 'details'}>
          <div className="landscape:grid landscape:grid-cols-[minmax(240px,0.48fr)_minmax(0,0.52fr)] sm:grid sm:grid-cols-[minmax(280px,0.48fr)_minmax(0,0.52fr)]">
            <div className="relative bg-ink landscape:self-stretch sm:self-stretch">
              <div className={`${hasArtistImage ? 'aspect-[4/5] sm:aspect-auto sm:h-full' : 'aspect-[4/5]'} overflow-hidden`}>
                <img src={imageUrl} alt="" onError={hasArtistImage ? () => setFailedImageUrl(entry.imageUrl) : undefined} className={`h-full w-full ${hasArtistImage ? 'object-cover' : 'object-contain'}`} />
              </div>
              {hasArtistImage ? <MediaCredit media={entry.artistMedia} /> : null}
            </div>

            <div className="dialog-content-gutter flex flex-col bg-surface py-8 md:py-12">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                <time dateTime={entry.parsed?.date || undefined}>{entry.dateLabel}</time>
                {entry.venueName ? <span className="text-ink-muted"> &nbsp;&middot;&nbsp; {entry.venueName}{entry.venueCity ? `, ${entry.venueCity}` : ''}</span> : null}
              </p>
              <p aria-hidden="true" className="mt-3 font-display text-5xl uppercase leading-[0.9] text-ink min-[400px]:text-6xl sm:text-[4.5rem] lg:text-[5.5rem]">{entry.artist}</p>

              {isSeen && entry.ratingEmoji ? (
                <div className="mt-5 flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ring-1 ${entry.rating === 'like' ? 'bg-ink ring-ink/30' : 'bg-canvas ring-border'}`} aria-hidden="true"><span className="block translate-y-[1px] text-2xl leading-none">{entry.ratingEmoji}</span></span>
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">Verdict</p>
                    <p className="text-base font-semibold text-ink">{entry.ratingLabel}</p>
                  </div>
                </div>
              ) : null}

              {entry.notes ? (
                <blockquote className="mt-8 border-l-2 border-accent pl-5 font-serif text-xl italic leading-[1.55] text-ink sm:text-2xl sm:leading-[1.5]">
                  <span className="mr-1 text-3xl leading-none text-accent" aria-hidden="true">&ldquo;</span>{entry.notes}<span className="ml-1 text-accent" aria-hidden="true">&rdquo;</span>
                </blockquote>
              ) : null}

              <div className={`${entry.notes ? 'mt-10' : 'mt-8'} flex flex-wrap gap-2 border-t border-border pt-6 sm:gap-3`}>
                <button type="button" onClick={() => onEdit(entry)} className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-canvas transition hover:bg-primary">
                  Edit this entry
                </button>
                <a href={entry.artistHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[15px] font-medium text-ink-muted transition hover:border-control-border hover:text-ink">
                  More on {entry.artist} <span className="ml-1.5" aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span>
                </a>
                {entry.venueMapUrl ? (
                  <a href={entry.venueMapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[15px] font-medium text-ink-muted transition hover:border-control-border hover:text-ink">
                    Find the venue <span className="ml-1.5" aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          {entry.venueName ? (
            <div className="dialog-content-gutter border-t border-border bg-canvas pb-[max(2rem,env(safe-area-inset-bottom))]">
              <section aria-labelledby="venue-photo-title" className="py-8 sm:py-10">
                <div className="sm:grid sm:grid-cols-[minmax(0,1.35fr)_minmax(14rem,0.65fr)] sm:gap-8">
                  <div className="overflow-hidden rounded-card">
                    {entry.venueMedia ? (
                      <img src={entry.venueMedia.imageUrl} alt="" className="aspect-[16/9] h-full w-full object-cover" />
                    ) : entry.venueMark ? (
                      <img src={entry.venueMark} alt="" className="aspect-[16/10] h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-col sm:mt-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">The room</p>
                    <h3 id="venue-photo-title" className="mt-2 font-display text-3xl uppercase leading-none text-ink sm:text-4xl">{entry.venueName}</h3>
                    {entry.venueTypeLabel || entry.venueNeighborhood ? (
                      <p className="mt-3 text-sm text-ink">
                        {entry.venueTypeLabel ? <span>{entry.venueTypeLabel}</span> : null}
                        {entry.venueTypeLabel && entry.venueNeighborhood ? <span className="text-ink-muted"> in </span> : null}
                        {entry.venueNeighborhood ? <span>{entry.venueNeighborhood}</span> : null}
                      </p>
                    ) : null}
                    {entry.venueCity ? <p className="mt-1 text-sm text-ink-muted">{entry.venueCity}</p> : null}
                    {entry.venueMapUrl ? (
                      <a href={entry.venueMapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center self-start rounded-full border border-border px-4 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink">
                        See it on the map <span className="ml-1.5" aria-hidden="true">&#8599;</span><span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : null}
                    {entry.venueMedia ? <div className="mt-auto pt-4"><MediaCredit media={entry.venueMedia} /></div> : null}
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {hasMomentsTab ? (
          <div id="moments-panel" role="tabpanel" aria-labelledby="moments-tab" hidden={activeTab !== 'moments'} className="dialog-content-gutter bg-surface pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-[max(2.25rem,env(safe-area-inset-bottom))]">
            <ConcertMoments entry={entry} uploads={uploads} onUpload={onUpload} onDelete={onDeleteUpload} />
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default function App() {
  const appContentRef = useRef(null)
  const filterHeadingRef = useRef(null)
  const [catalog, setCatalog] = useState(null)
  const [liveMediaManifest, setLiveMediaManifest] = useState(null)
  const [concertUploads, setConcertUploads] = useState([])
  const [page, setPage] = useState('concerts')
  const [collection, setCollection] = useState('seen')
  const [query, setQuery] = useState('')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [detailsFilter, setDetailsFilter] = useState('all')
  const [sort, setSort] = useState('note')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return window.localStorage.getItem('concert-view-mode') === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const [selectedConcert, setSelectedConcert] = useState(null)
  const [detailFocus, setDetailFocus] = useState('details')
  const [editor, setEditor] = useState(null)
  const [editorError, setEditorError] = useState('')
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [announcedResultSummary, setAnnouncedResultSummary] = useState('')
  const [adminSignIn, setAdminSignIn] = useState({ open: false, message: '', afterSignIn: null })
  const [hasAdminCredential, setHasAdminCredential] = useState(() => Boolean(getAdminCredential()))
  const [, startTransition] = useTransition()
  const deferredQuery = useDeferredValue(query)

  function openAdminSignIn(message, afterSignIn = null) {
    setAdminSignIn({ open: true, message: message || '', afterSignIn })
  }

  function handleAdminSubmit(username, password) {
    setAdminCredential(username, password)
    setHasAdminCredential(true)
    const callback = adminSignIn.afterSignIn
    setAdminSignIn({ open: false, message: '', afterSignIn: null })
    if (typeof callback === 'function') {
      // Give React a tick to close the modal before retrying the failed action.
      window.setTimeout(() => callback(), 0)
    }
  }

  function handleAdminSignOut() {
    clearAdminCredential()
    setHasAdminCredential(false)
  }

  // Wrap a mutation call so a 401 auto-opens the sign-in dialog and retries after success.
  function withAdminAuth(action, contextMessage) {
    return action().catch((caughtError) => {
      if (caughtError?.status === 401 || caughtError?.status === 503) {
        openAdminSignIn(
          contextMessage || 'Editing the concert log requires the shared password.',
          () => withAdminAuth(action, contextMessage),
        )
      }
      throw caughtError
    })
  }

  useEffect(() => {
    try {
      window.localStorage.setItem('concert-view-mode', viewMode)
    } catch {
      // The selected view still works when private browsing blocks local storage.
    }
  }, [viewMode])

  useEffect(() => {
    let active = true
    fetchConcertsCatalog()
      .then((result) => {
        if (active) {
          setError('')
          startTransition(() => setCatalog(result))
        }
      })
      .catch((caughtError) => {
        if (active) setError(caughtError.message)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchConcertUploads()
      .then((result) => {
        if (active) setConcertUploads(result.items || [])
      })
      .catch(() => {
        // Upload browsing remains optional if the local media endpoint is offline.
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchConcertMedia()
      .then((manifest) => {
        if (active) setLiveMediaManifest(manifest)
      })
      .catch(() => {
        // The bundled manifest remains available when the live endpoint is offline.
      })
    return () => {
      active = false
    }
  }, [])

  const enrichEntry = useMemo(() => createConcertEnricher(liveMediaManifest || undefined), [liveMediaManifest])

  const collections = useMemo(() => {
    if (!catalog) return { seen: [], upcoming: [], wishlist: [] }
    return {
      seen: catalog.parsedCatalog.haveSeen.map(enrichEntry),
      upcoming: (catalog.parsedCatalog.futureConcerts || []).map(enrichEntry),
      wishlist: catalog.parsedCatalog.wantToSee.map(enrichEntry),
    }
  }, [catalog, enrichEntry])

  const entries = collections[collection]
  const filteredEntries = useMemo(
    () => sortEntries(
      entries.filter((entry) => {
        const matchesRating = collection !== 'seen' || ratingFilter === 'all' || (ratingFilter === 'unrated' ? !entry.rating : entry.rating === ratingFilter)
        return matchesRating && matchesDetailsFilter(entry, detailsFilter) && matchesQuery(entry, deferredQuery)
      }),
      sort,
    ),
    [collection, deferredQuery, detailsFilter, entries, ratingFilter, sort],
  )
  const filteredUploads = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    if (!normalizedQuery) return concertUploads
    return concertUploads.filter((upload) => (
      [upload.artist, upload.date, formatMomentDate(upload.date), upload.mediaType, upload.originalName]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    ))
  }, [concertUploads, deferredQuery])

  const defaultSort = collection === 'upcoming' ? 'date' : 'note'
  const hasActiveFilters = Boolean(query) || ratingFilter !== 'all' || detailsFilter !== 'all' || sort !== defaultSort
  const activeControlCount = Number(collection === 'seen' && ratingFilter !== 'all') + Number(detailsFilter !== 'all') + Number(sort !== defaultSort)
  const collectionLabel = collectionDetails[collection].countLabel
  const resultSummary = catalog
    ? `${filteredEntries.length} of ${entries.length} ${collectionLabel}`
    : error
      ? `Unable to load ${collectionLabel}`
      : `Loading ${collectionLabel}`

  useEffect(() => {
    const timeout = window.setTimeout(() => setAnnouncedResultSummary(error ? '' : resultSummary), 400)
    return () => window.clearTimeout(timeout)
  }, [error, resultSummary])

  function changeCollection(nextCollection) {
    setPage('concerts')
    setCollection(nextCollection)
    setRatingFilter('all')
    setFiltersOpen(false)
    setSort(nextCollection === 'upcoming' ? 'date' : 'note')
  }

  function clearFilters() {
    setQuery('')
    setRatingFilter('all')
    setDetailsFilter('all')
    setSort(defaultSort)
    window.requestAnimationFrame(() => filterHeadingRef.current?.focus())
  }

  async function refresh() {
    setError('')
    setSyncMessage('')
    setIsRefreshing(true)
    try {
      const result = await withAdminAuth(() => refreshConcertsCatalog(), 'Syncing from Apple Notes requires the shared password.')
      const media = await fetchConcertMedia().catch(() => null)
      startTransition(() => setCatalog(result))
      if (media) setLiveMediaManifest(media)
      setSyncMessage('Concert list synced.')
    } catch (caughtError) {
      // 401/503 already surfaced the sign-in dialog; suppress the top-level error banner for auth cases.
      if (caughtError?.status !== 401 && caughtError?.status !== 503) setError(caughtError.message)
    } finally {
      setIsRefreshing(false)
    }
  }

  function openCreateEditor() {
    setEditorError('')
    setEditor({ mode: 'create', collection, entry: null })
  }

  function openEditEditor(entry) {
    const entryCollection = entry.status === 'seen' ? 'seen' : entry.status === 'upcoming' ? 'upcoming' : 'wishlist'
    setEditorError('')
    setEditor({ mode: 'edit', collection: entryCollection, entry })
  }

  function editFromDetails(entry) {
    setSelectedConcert(null)
    openEditEditor(entry)
  }

  function openDetails(entry) {
    setDetailFocus('details')
    setSelectedConcert(entry)
  }

  function openMoments(entry) {
    setDetailFocus('moments')
    setSelectedConcert(entry)
  }

  function viewMomentConcert(upload) {
    const artistKey = normalizeMediaTag(upload.artist)
    const entry = [...collections.seen, ...collections.upcoming].find((candidate) => (
      [candidate.artist, candidate.sourceArtist].some((name) => normalizeMediaTag(name) === artistKey)
      && concertMediaDate(candidate) === upload.date
    ))
    if (entry) openMoments(entry)
  }

  async function saveEntry({ raw, artist, imageUrl, entryChanged }) {
    if (!editor || !catalog) return
    setEditorError('')
    setIsSavingEntry(true)
    const payload = {
      section: sectionByCollection[editor.collection],
      raw,
      expectedModifiedAt: catalog.source.modifiedAt,
    }
    try {
      let nextCatalog = catalog
      if (entryChanged) {
        const mutate = (mutationPayload) => editor.mode === 'create'
          ? createConcertEntry(mutationPayload)
          : updateConcertEntry({ ...mutationPayload, originalRaw: editor.entry.raw })
        try {
          const result = await withAdminAuth(() => mutate(payload), 'Saving to the concert log requires the shared password.')
          nextCatalog = result.catalog
        } catch (caughtError) {
          if (caughtError.status !== 409) throw caughtError

          const freshCatalog = await refreshConcertsCatalog({ enrich: false })
          startTransition(() => setCatalog(freshCatalog))
          const freshEntries = entriesForSection(freshCatalog, payload.section)
          const originalStillExists = editor.mode === 'edit' && freshEntries.some((entry) => entry.raw.trim() === editor.entry.raw.trim())
          const savedEntryExists = freshEntries.some((entry) => entry.raw.trim() === raw)
          const oldMatchingCount = entriesForSection(catalog, payload.section).filter((entry) => entry.raw.trim() === raw).length
          const freshMatchingCount = freshEntries.filter((entry) => entry.raw.trim() === raw).length
          const alreadySaved = editor.mode === 'edit'
            ? !originalStillExists && savedEntryExists
            : freshMatchingCount > oldMatchingCount

          if (alreadySaved) {
            nextCatalog = freshCatalog
          } else if (editor.mode === 'edit' && !originalStillExists) {
            throw new Error('This entry was changed elsewhere while you were editing it. The latest version is now loaded; reopen it and try again.')
          } else {
            const result = await mutate({ ...payload, expectedModifiedAt: freshCatalog.source.modifiedAt })
            nextCatalog = result.catalog
          }
          setSyncMessage('The note changed while you were editing, so the latest version was synced automatically.')
        }
      }
      const media = imageUrl
        ? await withAdminAuth(() => setArtistImage(artist, imageUrl), 'Saving artist artwork requires the shared password.')
        : await fetchConcertMedia().catch(() => null)
      startTransition(() => setCatalog(nextCatalog))
      if (media) setLiveMediaManifest(media)
      setSyncMessage(entryChanged
        ? editor.mode === 'create' ? 'Concert added to Apple Notes.' : 'Concert updated in Apple Notes.'
        : `Updated the artist image for ${artist}.`)
      setEditor(null)
    } catch (caughtError) {
      if (caughtError?.status !== 401 && caughtError?.status !== 503) setEditorError(caughtError.message)
    } finally {
      setIsSavingEntry(false)
    }
  }

  async function uploadConcertFiles(entry, files) {
    const date = concertMediaDate(entry)
    if (!date) throw new Error('Add a concert date before uploading media.')
    const added = []
    for (const file of files) {
      const upload = await withAdminAuth(() => uploadConcertMedia(entry.artist, date, file), 'Uploading photos requires the shared password.')
      added.push(upload)
      setConcertUploads((current) => [...current, upload])
    }
    return added
  }

  async function deleteConcertUpload(upload) {
    await withAdminAuth(() => deleteConcertMedia(upload.id), 'Deleting photos requires the shared password.')
    setConcertUploads((current) => current.filter((item) => item.id !== upload.id))
    setSyncMessage(`Removed ${upload.originalName} from ${upload.artist}.`)
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div ref={appContentRef}>
        <header className="bg-canvas">
          <div className="page-gutter mx-auto max-w-[1440px]">
            <div className="flex items-start justify-between gap-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 sm:pt-6 sm:pb-4 lg:pt-8">
              <a href="#top" className="flex min-w-0 items-center gap-3 sm:gap-4">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink font-display text-lg uppercase tracking-[0.08em] text-canvas sm:h-12 sm:w-12 sm:text-xl">J&amp;B</span>
                <span className="min-w-0">
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-accent sm:text-xs">A concert journal</span>
                  <span className="mt-0.5 block truncate font-display text-2xl uppercase leading-none text-ink sm:text-3xl lg:text-[2.15rem]">Jenny &amp; Brent&rsquo;s Concert Log</span>
                </span>
              </a>
              <div className="flex shrink-0 items-center gap-2">
                {hasAdminCredential ? (
                  <button
                    type="button"
                    onClick={handleAdminSignOut}
                    title="Signed in as editor. Click to sign out."
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink"
                  >
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
                    <span className="hidden sm:inline">Editor</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAdminSignIn('Sign in to add shows, upload photos, and sync from Apple Notes.', null)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink"
                  >
                    <span aria-hidden="true">&#128274;</span>
                    <span className="hidden sm:inline">Sign in</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={refresh}
                  disabled={isRefreshing}
                  aria-busy={isRefreshing}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-medium text-ink-muted transition hover:border-control-border hover:text-ink disabled:cursor-wait disabled:opacity-60"
                >
                  <span aria-hidden="true" className={isRefreshing ? 'inline-block animate-spin' : 'inline-block'}>&#8635;</span>
                  {isRefreshing ? 'Syncing' : 'Sync'}
                </button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">{syncMessage}</p>
            </div>

            <div className="flex flex-col gap-3 pb-4 pt-1 sm:pb-5 sm:pt-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <nav aria-label="Concert collections" className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 sm:gap-2">
                {[
                  ['seen', 'Seen'],
                  ['upcoming', 'Next up'],
                  ['wishlist', 'Wish list'],
                  ['atlas', 'Atlas'],
                  ['moments', 'Moments'],
                ].map(([id, label]) => {
                  const isTopLevel = id === 'moments' || id === 'atlas'
                  const isActive = isTopLevel ? page === id : page === 'concerts' && collection === id
                  const count = id === 'moments' ? concertUploads.length : id === 'atlas' ? null : collections[id].length
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => isTopLevel ? setPage(id) : changeCollection(id)}
                      aria-pressed={isActive}
                      className={`group inline-flex min-h-11 shrink-0 items-baseline gap-2 border-b-2 px-2 pb-1 pt-2 text-base font-semibold transition sm:text-lg ${isActive ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
                    >
                      <span>{label}</span>
                      {count != null ? <span className={`text-xs font-semibold tabular-nums ${isActive ? 'text-accent' : 'text-ink-muted/70'}`}>{count}</span> : null}
                    </button>
                  )
                })}
              </nav>

              {page === 'atlas' ? null : (
                <label className="focus-control flex h-11 min-w-0 items-center gap-3 rounded-full border border-control-border bg-surface px-4 lg:h-11 lg:w-96">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-ink-muted" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m16 16 4 4" />
                  </svg>
                  <span className="sr-only">{page === 'moments' ? 'Search moments' : 'Search the archive'}</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={page === 'moments' ? 'Search moments\u2026' : 'Search artists, venues, notes\u2026'}
                    className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-muted"
                  />
                  {query ? (
                    <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-ink-muted hover:text-ink">&times;</button>
                  ) : null}
                </label>
              )}
            </div>
          </div>
        </header>

        <main className="page-gutter mx-auto max-w-[1440px] py-4 sm:py-6 lg:py-8">
          {page === 'moments' ? <MomentsFeed uploads={filteredUploads} onViewConcert={viewMomentConcert} /> : page === 'atlas' ? <AtlasPage collections={collections} onOpenEntry={openDetails} /> : (
            <>
          <section aria-labelledby="collection-title">
            <div className="mb-6 flex flex-col gap-5 border-b border-border pb-5 sm:mb-8 sm:gap-6 sm:pb-6 lg:mb-10 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:pb-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{collectionDetails[collection].eyebrow}</p>
                <h2 ref={filterHeadingRef} id="collection-title" tabIndex="-1" className="mt-3 font-display text-[3rem] uppercase leading-[0.9] text-ink min-[400px]:text-[3.75rem] sm:mt-4 sm:text-[5rem] lg:text-[6rem]">{collectionDetails[collection].title}</h2>
                <p className="mt-4 max-w-xl text-base leading-6 text-ink-muted sm:text-lg sm:leading-7">{collectionDetails[collection].description}</p>
              </div>
              <button type="button" onClick={openCreateEditor} disabled={!catalog} className="group inline-flex min-h-12 shrink-0 items-center gap-2.5 self-start rounded-full bg-ink px-5 text-[15px] font-medium text-canvas transition hover:bg-primary disabled:cursor-wait disabled:bg-ink-muted lg:self-end">
                <span aria-hidden="true" className="text-lg leading-none">&#43;</span>{collectionDetails[collection].addLabel}
              </button>
            </div>

            <section aria-labelledby="filter-heading" className="mb-6 sm:mb-8 lg:mb-10">
              <h3 id="filter-heading" className="sr-only">Browse controls</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border pb-3 text-sm">
                <p className="text-sm font-semibold tabular-nums text-ink"><span className="text-ink">{filteredEntries.length}</span><span className="text-ink-muted"> / {entries.length} {collectionDetails[collection].countLabel}</span></p>
                <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcedResultSummary}</p>
                <span aria-hidden="true" className="text-ink-muted/50">&mdash;</span>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  aria-expanded={filtersOpen}
                  aria-controls="filter-controls"
                  className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-ink hover:text-primary"
                >
                  <span>Filters</span>
                  {activeControlCount ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-canvas">{activeControlCount}</span> : null}
                  <span aria-hidden="true" className="text-xs">{filtersOpen ? '\u25B4' : '\u25BE'}</span>
                </button>
                {hasActiveFilters ? (
                  <button type="button" onClick={clearFilters} className="inline-flex min-h-9 items-center text-sm font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">Reset</button>
                ) : null}
                <div role="group" aria-label="Concert view" className="ml-auto inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  <span className="hidden sm:inline">View</span>
                  <div className="inline-flex overflow-hidden rounded-full border border-border">
                    <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} aria-label="Grid view" className={`inline-flex h-9 min-w-9 items-center justify-center px-2.5 transition ${viewMode === 'grid' ? 'bg-ink text-canvas' : 'bg-surface text-ink-muted hover:text-ink'}`}>
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current"><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></svg>
                    </button>
                    <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} aria-label="List view" className={`inline-flex h-9 min-w-9 items-center justify-center px-2.5 transition ${viewMode === 'list' ? 'bg-ink text-canvas' : 'bg-surface text-ink-muted hover:text-ink'}`}>
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current"><rect x="2" y="3" width="16" height="3" rx="1" /><rect x="2" y="8.5" width="16" height="3" rx="1" /><rect x="2" y="14" width="16" height="3" rx="1" /></svg>
                    </button>
                  </div>
                </div>
              </div>

              <div id="filter-controls" className={`${filtersOpen ? 'grid' : 'hidden'} gap-x-6 gap-y-4 border-b border-border py-4 sm:grid-cols-2 ${collection === 'seen' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
                {collection === 'seen' ? (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Rating</span>
                    <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)} className="h-11 w-full rounded-none border-0 border-b border-control-border bg-transparent px-0 text-base text-ink">
                      <option value="all">Any rating</option>
                      <option value="obsessed">All-time favorite</option>
                      <option value="love">Loved it</option>
                      <option value="like">Liked it</option>
                      <option value="disappointed">Not a favorite</option>
                      <option value="unrated">Not rated yet</option>
                    </select>
                  </label>
                ) : null}

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Only show entries with</span>
                  <select value={detailsFilter} onChange={(event) => setDetailsFilter(event.target.value)} className="h-11 w-full rounded-none border-0 border-b border-control-border bg-transparent px-0 text-base text-ink">
                    <option value="all">Everything</option>
                    <option value="date">A date</option>
                    <option value="venue">A venue</option>
                    <option value="notes">A written memory</option>
                    <option value="photos">Photography</option>
                    <option value="needs-details">Missing details</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Sort</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 w-full rounded-none border-0 border-b border-control-border bg-transparent px-0 text-base text-ink">
                    <option value="note">As written in Notes</option>
                    <option value="note-desc">Most recently added</option>
                    <option value="artist">Artist A\u2013Z</option>
                    {collection === 'seen' ? <option value="rating-desc">Highest rated first</option> : null}
                    {collection === 'seen' ? <option value="rating-asc">Lowest rated first</option> : null}
                    <option value="date">Calendar date</option>
                  </select>
                </label>
              </div>
            </section>

            {error ? (
              <div role="alert" className="mb-8 rounded-card border border-accent bg-surface p-5 text-ink shadow-card">
                <h3 className="text-lg font-semibold">{catalog ? 'The concert list could not be synced' : 'The concert list could not be loaded'}</h3>
                <p className="mt-1 text-base leading-6 text-ink-muted">{error}</p>
                <button type="button" onClick={refresh} disabled={isRefreshing} className="mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-4 py-2 text-base font-semibold text-surface transition hover:bg-primary-hover disabled:cursor-wait">
                  {isRefreshing ? 'Trying again…' : catalog ? 'Try syncing again' : 'Try again'}
                </button>
              </div>
            ) : null}

            {!catalog && !error ? (
              <div className={viewMode === 'grid' ? 'grid gap-6 sm:grid-cols-2 sm:gap-8 min-[960px]:grid-cols-3 xl:grid-cols-4' : ''} aria-busy="true">
                <p className="sr-only">Loading concerts</p>
                {Array.from({ length: 8 }, (_, index) => (
                  viewMode === 'grid' ? (
                    <div key={index} aria-hidden="true" className="overflow-hidden rounded-card bg-surface">
                      <div className="aspect-[4/5] animate-pulse bg-surface-muted" />
                      <div className="space-y-3 p-5"><div className="h-5 w-1/2 animate-pulse rounded bg-surface-muted" /><div className="h-4 w-3/4 animate-pulse rounded bg-surface-muted" /></div>
                    </div>
                  ) : (
                    <div key={index} aria-hidden="true" className="h-16 animate-pulse border-b border-border bg-surface-muted/40" />
                  )
                ))}
              </div>
            ) : null}

            {catalog && filteredEntries.length ? (
              <>
                {viewMode === 'list' ? (
                  <div aria-hidden="true" className="hidden grid-cols-[3rem_2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_9rem_auto] gap-x-6 border-b-2 border-ink pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-muted lg:grid">
                    <span>No.</span>
                    <span className="text-center">Rating</span>
                    <span>Artist &amp; venue</span>
                    <span />
                    <span>Date</span>
                    <span className="text-right">&nbsp;</span>
                  </div>
                ) : null}
                <div className={viewMode === 'grid' ? 'grid gap-6 sm:grid-cols-2 sm:gap-8 min-[960px]:grid-cols-3 xl:grid-cols-4' : viewMode === 'list' ? 'border-b border-border' : 'grid gap-2'}>
                  {filteredEntries.map((entry, displayIndex) => (
                    viewMode === 'grid'
                      ? <ConcertCard key={`${entry.status}-${entry.index}-${entry.raw}`} entry={entry} momentCount={uploadsForConcert(entry, concertUploads).length} onOpen={openDetails} onOpenMoments={openMoments} />
                      : <ConcertListRow key={`${entry.status}-${entry.index}-${entry.raw}`} entry={entry} displayIndex={displayIndex} momentCount={uploadsForConcert(entry, concertUploads).length} onOpen={openDetails} onOpenMoments={openMoments} />
                  ))}
                </div>
              </>
            ) : null}

            {catalog && filteredEntries.length === 0 ? (
              <div className="px-4 py-20 text-center sm:py-24">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{hasActiveFilters ? 'Nothing matches' : collectionDetails[collection].emptyEyebrow}</p>
                <h3 className="mx-auto mt-4 max-w-2xl font-display text-4xl uppercase leading-[0.95] text-ink sm:text-5xl lg:text-6xl">{hasActiveFilters ? 'No shows in this cut' : collectionDetails[collection].emptyHeading}</h3>
                <p className="mx-auto mt-4 max-w-md text-base leading-7 text-ink-muted">
                  {hasActiveFilters ? 'Try loosening the filters or searching a different name.' : collectionDetails[collection].emptyBody}
                </p>
                {hasActiveFilters ? (
                  <button type="button" onClick={clearFilters} className="mt-8 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-canvas transition hover:bg-primary">Reset filters</button>
                ) : null}
              </div>
            ) : null}
          </section>

          <footer className="mt-20 border-t border-border pt-8 pb-6 sm:mt-24 sm:pt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <p className="font-display text-3xl uppercase leading-none text-ink sm:text-4xl">Keep the record going.</p>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Sourced from a shared Apple Note</p>
            </div>
          </footer>
            </>
          )}
        </main>
      </div>

      <DetailModal
        key={selectedConcert ? `${selectedConcert.status}-${selectedConcert.index}-${detailFocus}` : 'closed-detail'}
        entry={selectedConcert}
        uploads={uploadsForConcert(selectedConcert, concertUploads)}
        focusSection={detailFocus}
        onClose={() => setSelectedConcert(null)}
        onEdit={editFromDetails}
        onUpload={uploadConcertFiles}
        onDeleteUpload={deleteConcertUpload}
        backgroundRef={appContentRef}
      />
      {editor ? (
        <EntryEditor
          editor={editor}
          isSaving={isSavingEntry}
          error={editorError}
          onClose={() => setEditor(null)}
          onSave={saveEntry}
          backgroundRef={appContentRef}
        />
      ) : null}
      {isRefreshing ? <SyncProgress /> : null}
      <AdminSignIn
        open={adminSignIn.open}
        message={adminSignIn.message}
        onClose={() => setAdminSignIn({ open: false, message: '', afterSignIn: null })}
        onSubmit={handleAdminSubmit}
        backgroundRef={appContentRef}
      />
    </div>
  )
}
