# Jenny & Brent's Concert Log UI Design Plan

## Goal

Create a warm, editorial concert journal that feels personal and polished. Licensed photography and clearly labeled artist-profile imagery bring real shows to life, while generated posters provide resilient fallbacks.

The redesign succeeds when:

- cards are clearly separated from the page without harsh outlines or competing colors;
- every important label and control is comfortably readable;
- search, filtering, browsing, and opening details feel obvious on mobile and desktop;
- the interface meets WCAG 2.2 AA contrast and keyboard requirements;
- new UI can be built from semantic tokens instead of one-off color values.

## Visual Direction

**Modern pastel concert journal**: deep slate-blue identity, warm cream, crisp typography, compact editorial rhythm, concert photography, colorful poster art, and restrained dusty-rose details.

The intended character is:

- personal, not corporate;
- expressive, not noisy;
- refined, not fragile;
- friendly, not childish;
- contemporary, not generic.

Avoid neo-brutalist black outlines, multicolored hard shadows, pastel fills on every control, ornamental gradients, glass effects, and decoration that competes with the artwork. A restrained image overlay is allowed when required for readable text.

## Non-Negotiable Rules

1. Artist photography and poster art are the primary sources of color. Cards and controls do not receive unique background colors.
2. Use one dominant accent in a region. Rating colors are reserved for rating badges and never tint a whole card.
3. Use semantic design tokens. Do not add literal hex colors to components.
4. Normal text must reach a 4.5:1 contrast ratio. Large text and essential UI boundaries must reach 3:1.
5. Body copy and mobile form controls are at least 16px. Essential metadata and form labels are at least 14px.
6. Every interactive element has a visible focus state and a target of at least 44 by 44px where practical.
7. Color never communicates state by itself. Pair it with text, an icon, or both.
8. Use display type only for meaningful headings. Controls, metadata, and paragraphs use the sans-serif family.
9. Motion supports orientation but is never required to understand state.
10. Mobile behavior is designed explicitly rather than treated as a compressed desktop layout.

## Color System

These are the target semantic tokens. The final implementation may adjust a value only after checking all affected contrast pairs.

| Token | Value | Purpose |
| --- | --- | --- |
| `canvas` | `#F7F4EF` | Warm neutral page background |
| `surface` | `#FFFDF9` | Cards, toolbar, and modal content |
| `surface-muted` | `#E3EDF1` | Quiet powder-blue grouped regions |
| `masthead` | `#D3E8F0` | Pastel-blue utility and progress surface |
| `header` | `#F6E2E8` | Restrained blush supporting surface |
| `ink` | `#1F2A33` | Primary text and overlays |
| `ink-muted` | `#52606A` | Secondary text; tested above 4.5:1 on light surfaces |
| `border` | `#C2D2D8` | Decorative dividers and card edges |
| `control-border` | `#6B7C84` | Essential input boundaries; tested above 3:1 |
| `primary` | `#315C70` | Selected states and primary actions |
| `primary-hover` | `#254756` | Primary hover and active state |
| `accent` | `#9E3E61` | Dusty-rose editorial highlights and links |
| `focus` | `#15688B` | Focus rings only |

Rating tokens are semantic and limited to badges:

| Rating | Value |
| --- | --- |
| All-time favorite | `#9A365A` |
| Loved it | `#315C70` |
| Liked it | `#357176` |
| Not a favorite | `#62696A` |

### Color Proportions

- 80% canvas and neutral surfaces
- 15% powder-blue identity color
- 5% accent, rating, and decorative color

### Surface Ladder

1. `canvas`: page background
2. `surface`: cards and controls
3. `surface-muted`: grouped or inactive regions
4. `masthead`: pastel-blue site identity
5. `primary`: selected emphasis and actions
6. overlay: `ink` at approximately 72% opacity behind dialogs

Do not place multiple competing pastel surfaces inside one component. Separate surfaces with spacing first, a subtle border second, and elevation only when needed.

## Typography

- Use **Source Sans 3** for body text, metadata, labels, controls, and buttons.
- Use **League Gothic** for the site title, page heading, and artist names only.
- Keep paragraph line length between roughly 45 and 75 characters.
- Use sentence case for controls and form labels.
- Reserve uppercase text for short editorial eyebrows; do not use it for instructions or long labels.
- Limit tracked uppercase text to about `0.08em`.

| Role | Size / line height | Notes |
| --- | --- | --- |
| Site title | responsive `44-72px` / `0.95` | Display face |
| Page title | responsive `38-56px` / `1` | Display face |
| Artist display | `30-48px` / `1` | Generated into poster art or overlaid on licensed photography |
| Section heading | `24-32px` / `1.15` | Sans or display based on context |
| Body | `16px` / `24px` | Default reading size |
| Metadata | `14px` / `20px` | Never smaller for essential information |
| Button/input | `16px` / `20px` | Prevents mobile input zoom |

## Spacing, Shape, and Elevation

- Use an 8px spacing rhythm with `4, 8, 12, 16, 24, 32, 48, 64` as the working scale.
- Use 16px mobile page gutters, 24px tablet gutters, and 40px desktop gutters.
- Use 10px radii for controls, 14px for cards, and 18px for large dialogs.
- Use a 1px neutral border for cards and controls.
- Use one neutral card shadow, approximately `0 10px 30px rgb(28 27 31 / 10%)`.
- Do not apply full-card hover motion when only the visible details button is interactive.
- Section spacing is at least 32px on mobile and 48px on desktop.

## Component Rules

### App Shell and Header

- Use deep slate-blue for one compact masthead, warm cream for the page, and reserve powder blue for quiet utility surfaces.
- Keep the title and short description together; avoid decorative counters that compete with navigation.
- Treat sync as a quiet secondary action with clear busy and success states.
- Place collection navigation and search in a light surface below the masthead.
- Show the active collection with text, shape, and color, plus `aria-pressed` or tab semantics.
- On phones, keep the masthead and search compact enough that navigation, page context, and the first browse control fit without excessive scrolling.

### Search and Filters

- Search is the most prominent control and always remains visible.
- All fields use the same neutral surface, border, label treatment, and focus ring.
- Desktop uses an open editorial setlist strip with horizontal rules and underline controls. Mobile uses a clear `Filters` disclosure over a quiet powder-blue work area.
- The closed mobile filter state is one compact row containing the result count and Filters action; reserve the editorial filter heading for desktop.
- Display the active filter count in the disclosure label.
- Show `Clear filters` only when filters are active.
- Announce the updated result count in a polite live region.

### Add And Edit

- Each collection exposes one clear Add action with fields tailored to Seen, Upcoming, or Wishlist entries.
- Cards expose only their Details action; Edit lives inside the detail dialog and replaces that exact source entry in place.
- Clearly disclose that saving writes directly to Apple Notes.
- Use the catalog modification timestamp to reject stale writes rather than overwriting newer Notes edits.
- On a stale write, sync automatically, recognize saves that already landed, and retry once only when the original entry still matches.
- Automatic stale-write recovery uses deterministic sync and does not wait for OpenAI enrichment.
- Do not expose deletion or whole-note replacement controls.
- After additions and artist-name changes, resolve missing exact-match artist media and reload the live manifest without requiring a frontend rebuild.
- Keep the validated custom artist image URL inside the Add/Edit form; manual overrides take priority over automatic media.
- During saves, lock the form and show a persistent staged status with elapsed time so slow Apple Notes and media work never appears frozen.
- Manual sync uses a full-page staged progress view and explains that transient Apple Notes reads are retried automatically.

### Concert Grid

- Use one column below 640px, two from 640px, three from about 960px, and four from about 1280px.
- Preserve a consistent 4:5 card-art aspect ratio for both photography and generated posters.
- On phones, reviewed photography may use a shorter 4:3 crop to improve browsing density; generated posters remain uncropped.
- Keep grid gaps generous enough that neighboring card shadows never merge.
- Use stable card heights within each row without forcing text to tiny sizes.
- Provide an accessible Grid/List view switch and preserve the selected view locally across reloads.
- List view omits artwork and presents each concert as an editorial ledger row with a subdued entry number and a separate rating medallion, followed by artist, venue, date, Media, and Details.
- The rating area stays neutral while a semantic color rail and carefully centered emoji medallion carry the rating; the white-heart treatment must retain clear contrast. Omit visible descriptive rating text there while preserving an accessible label.
- Desktop list mode uses one shared six-column grid and a visible column header so every row aligns precisely; mobile reflows the same hierarchy into a compact two-column ticket.
- At very narrow phone widths, list-row action labels may collapse to clearly named icon controls while retaining 44px touch targets.

### Concert Card

- Every card uses the same `surface` background, neutral border, radius, and neutral shadow.
- Let artist photography or poster art occupy the visual top of the card without a large overlapping status badge.
- Vary poster color and motif deterministically so adjacent entries do not form a repetitive wall.
- Show artist names over photography with a restrained contrast overlay; do not repeat the name visibly below generated poster art.
- Use the card body for rating/status, formatted date, venue, city, personal note, and a visible details action.
- Retain a semantic card heading for assistive technology regardless of artwork type.
- Remove duplicated decorative labels such as both `Concert 001` and `Jenny's rating` when they do not help the user decide.
- Clamp personal notes in cards and show their complete text in the detail dialog.
- Structure the card as an article with a real heading. Use a clearly named button to open details rather than wrapping all card content in one large button.
- Dated concert cards pair a filled Details button with an outlined Photos + videos shortcut; each action opens its matching tab in the concert dialog.
- Treat card artwork as decorative when the semantic artist heading communicates the same information.

### Detail Dialog

- Desktop uses an artist-photo or poster column beside a compact summary, followed by full-width media sections so galleries never create an empty parallel column.
- Seen and upcoming dialogs separate concert information from uploaded media with accessible Details and Photos & videos tabs.
- Mobile uses a full-height sheet based on `100dvh`, safe-area padding, and a sticky header with a persistent close action.
- Use a shallow 16:10 crop for reviewed artist photography in mobile details so date, venue, and rating appear near the first viewport; keep generated poster artwork contained and uncropped.
- Present date, venue, rating, and notes in a clear reading order instead of separate competing colored boxes.
- Omit the personal-note block entirely when an entry has no note and keep the surrounding summary compact.
- Show a venue spotlight when licensed venue photography is available.
- De-emphasize or omit unavailable features such as an empty photos section.
- Keep focus trapped, restore focus on close, and isolate background content from assistive technology.
- Explicitly identify links that open a new tab.
- Seen and upcoming concerts with dates include a website-only Concert Moments gallery.
- Galleries use one fixed 16:9 image/video viewer so portrait, landscape, and video uploads do not resize the layout.
- Use uniform 4:3 thumbnails in a compact responsive grid, with desktop media context and controls in a side rail.
- Multi-file uploads remain separate from Apple Notes and are tagged by artist and concert date.
- The main Moments feed presents cross-concert media in a uniform responsive grid with fixed 4:3 previews and visible artist, date, media-type, and filename context.
- Video cards seek to an early frame after loading metadata so they show a useful visual preview before playback.
- Feed photos open in a full-size viewer; every feed item links back to its matching concert details.

### Media And Attribution

- Prefer reviewed, locally hosted Commons media from `src/data/concert-media.json`; use exact-match remote Deezer profile images when Commons has no suitable reusable image.
- Keep Commons creator, source, license, source hash, and modification metadata with every downloaded file.
- Keep provider, source, terms, and remote-display metadata with Deezer records; do not download or imply an open license for provider imagery.
- Cards provide a visible image-source action. Detail views show creator/provider, source, license or terms, and crop/resize disclosure in full.
- Never add an image from a generic search result without confirming its identity and reuse license.
- Regenerate the reviewed media pack with `npm run media:concerts` from the project root.

### Empty, Loading, Error, and Sync States

- Loading uses quiet card-shaped skeletons to preserve layout.
- Empty results explain what happened and offer one obvious reset action.
- Errors use `role="alert"`, plain language, and a retry action when possible.
- Loading and sync state use `aria-busy`; completion uses a polite status announcement.
- Disabled controls remain readable and are not indicated by opacity alone.

## Interaction and Accessibility

- Target WCAG 2.2 AA.
- Focus style: 2px `focus` ring plus at least 2px offset; it must reach 3:1 against adjacent colors.
- Never use `outline: none` without an equivalent visible replacement.
- Support keyboard operation for collections, search, filters, cards, dialog controls, and external links.
- Support `Escape`, focus containment, and focus restoration in the dialog.
- Use `prefers-reduced-motion` to remove nonessential lift, scale, and smooth scrolling.
- Use hover as enhancement only; every action must remain understandable without it.
- Keep tap targets at 44px where practical and never below the WCAG 2.2 minimum without sufficient spacing.
- Avoid horizontal scrolling at 320px and at 400% browser zoom.

## Responsive Rules

- Test widths: 320, 375, 640, 768, 1024, 1280, and 1440px.
- Test a short landscape viewport in addition to portrait phones.
- At 320px, header actions stack without truncating the title or causing horizontal scroll.
- At 320px, card actions may stack and use concise visible labels while retaining complete accessible names.
- Filter controls collapse intentionally on mobile rather than becoming a long wall of fields.
- Card text never overlaps the poster, rating, or action.
- Dialog close controls remain visible while dialog content scrolls.
- Use dynamic viewport units and safe-area insets for full-screen mobile UI.
- Full-screen editor chrome uses the same safe-area treatment as concert details, with compact phone spacing and full-size form controls.

## Implementation Plan

### Phase 1: Foundation

- Replace the current palette with the semantic tokens above in `tailwind.config.js`.
- Add base focus, reduced-motion, and typography behavior in `src/index.css`.
- Remove one-off component hex values and rating-based full-card surfaces from `src/App.jsx`.
- Keep the generated poster palette unchanged initially; it is content artwork, not UI chrome.

**Checkpoint:** verify all token contrast pairs before component work.

### Phase 2: Shell and Navigation

- Rebuild the header, collection navigation, search field, page heading, and result summary using the new surface ladder.
- Establish responsive page gutters and max width.
- Add selected-state semantics, visible focus, and live result announcements.

**Checkpoint:** review the design at 375px and 1440px before continuing.

### Phase 3: Toolbar and Cards

- Standardize filter fields and create intentional desktop/mobile layouts.
- Rebuild cards as semantic articles with uniform surfaces and restrained rating badges.
- Simplify metadata and remove duplicated visual labels.
- Add neutral hover, focus, loading, empty, and error states.

**Checkpoint:** confirm that posters are visually dominant and the grid remains easy to scan with every rating type.

### Phase 4: Detail Experience

- Simplify the modal color hierarchy and information order.
- Make mobile behavior viewport-safe with a sticky close action.
- Improve dialog isolation, focus handling, and external-link language.

### Phase 5: Verification and Polish

- Run the production build.
- Check every responsive width and browser zoom at 200% and 400%.
- Complete a keyboard-only pass, including the full dialog flow.
- Check all text, focus, status, and control-boundary contrast.
- Test reduced motion and mobile touch targets.
- Run Lighthouse or axe if available, then manually test VoiceOver on Safari.
- Fix issues before adding any optional decorative treatment.

### Phase 6: Rich Catalog And Media

- Parse seen entries into normalized date, venue, rating, and personal-note fields.
- Keep upcoming concerts separate from memories and wishlist artists.
- Add reviewed Commons artist and venue media with durable attribution metadata.
- Preserve generated posters as the fallback for unmatched entities.
- Validate the three collections and media states with automated screenshots.

## Definition of Done

- No arbitrary UI color values remain in React components.
- No whole-card background or hard shadow changes according to rating.
- All normal text reaches 4.5:1 and essential boundaries/focus states reach 3:1.
- No essential label is smaller than 14px; mobile controls are at least 16px.
- Every control has a visible keyboard focus state and an accessible name.
- Search and filtering changes are announced, and selected collection state is programmatic.
- The grid and dialog work without horizontal scrolling at 320px and 400% zoom.
- The close action remains reachable throughout mobile dialog scrolling.
- Reduced-motion behavior is present.
- The production build passes.
- Every local photograph has source and license metadata plus visible attribution in the UI.
- A visual review confirms the hierarchy at both 375px and 1440px before final polish.

## Agent Recommendation

Do not create a separate designer agent yet. The immediate problem is the absence of a stable design contract, not a lack of agent capability. A free-form designer agent could introduce another visual direction and make consistency worse.

After this direction is approved and implemented once, create a small project-local `ui-design-system` skill that contains the final tokens, component rules, and review checklist. Use it for future UI work. Consider a dedicated review agent only if the project grows to multiple pages or repeated independent design changes; that agent should audit conformance rather than invent a new style each time.

## Volume 02 - Editorial Recomposition

This amendment refines the previous direction after a UI audit found the site still leaned toward a well-organized app instead of an authored concert journal. Preserve everything in the Non-Negotiable Rules, Color System, Accessibility, and Media And Attribution sections above. The following adjustments override earlier component and copy guidance where they conflict.

### Voice

- Write like an editor, not a form. Use active editorial phrases such as "Log a show", "Shows we remember", "What is next", "Artists to catch", "The entry", "Open the show".
- Use "verdict" for rating labels and "the memory" or "why this artist" for the notes field.
- Do not surface the underlying Apple Notes data model in visible copy; keep that context to short editorial eyebrows and helper text.

### Masthead

- Use a single composed opening: a small J and B roundel in ink, an editorial eyebrow ("Vol. 01 - A concert journal"), the site title in League Gothic on canvas, and a quiet outline sync pill.
- Do not use a filled slate-blue bar for the top of the page; the canvas is the page identity.
- Sync becomes secondary chrome, not a primary color region.

### Collection Toolbar

- Combine collection navigation, search, page title, and browse controls into one continuous editorial opening.
- Use an underline collection switcher with the count next to the label in accent color.
- Use a single filters trigger with an active count badge, an inline reset link, and a compact rounded view toggle. Avoid tinted mobile filter panels and duplicated headings.
- Use a giant display heading, an editorial description, and a single dark pill Add action per collection.

### Grid Card

- Use one 4:5 image with a bottom-anchored gradient stack for artist name, dateline, and venue when licensed photography is available.
- Reserve the top-right for a rating medallion on seen entries and top-left for a small "Coming up" chip on upcoming entries with a real date.
- The card body carries the personal note as a serif pull-quote with an accent hairline, followed by a single dominant text-link Details action and an optional rounded outlined photos shortcut.
- Do not use a boxed status pill or rating badge inside the card body.
- Do not repeat metadata that already appears in the image overlay.
- Suppress the dateline on wishlist cards; the artist name is the entry.

### List View

- Present list mode as an editorial ledger with hairline dividers between rows. Do not use per-row shadow cards or full-width surface tints.
- Use six columns on desktop: entry number, rating glyph or rail, artist plus venue stack, spacer, date, and actions.
- Use a compact two-column ticket on mobile with the entry number, artist, venue, date, and action group flowing in a single article.
- Actions use small dark pills and rounded outline media chips; never full-width buttons.

### Detail Dialog

- Open the dialog with an editorial dateline plus venue line, a large League Gothic artist wordmark, and a small rating chip when applicable.
- Present the personal note as a large serif pull-quote with an accent hairline. Do not use a description-list block for date, venue, and rating.
- Use rounded outline secondary actions and a filled dark pill primary action.
- Venue spotlight becomes a two-column editorial block with the image on canvas and metadata beside it; do not wrap venue photography in a shadow card.

### Editor Dialog

- Use a light canvas header with a small editorial eyebrow and a League Gothic title such as "New show" or "Edit show".
- Rename the rating select to "Verdict" and drop the emoji prefixes; use plain rating labels.
- Rename note fields per collection: "The memory" for seen entries and "Why this artist" for wishlist entries.
- Primary and cancel actions are pill-shaped, not rectangular.

### Sync Progress

- Use a single equalizer motif on canvas with an editorial eyebrow, a League Gothic stage line, and a small "elapsed" caption in ink-muted.
- Do not use tinted circles or floating pastel surfaces behind the loading indicator.

### Footer

- Close with an authored line in League Gothic ("Keep the record going.") and a small metadata caption ("Sourced from a shared Apple Note"). Do not close with a stat readout.

### Type Rhythm

- Add a serif register for personal-note pull-quotes only, using the browser default serif stack. Do not add or ship an additional font.
- League Gothic is reserved for the site title, collection titles, artist headlines in cards and dialogs, and short empty-state headings.
- Use small caps eyebrows with 0.14 to 0.18em tracking for editorial context lines.

### Empty States

- Write per-collection empty content: eyebrow, League Gothic heading, and one short sentence. Provide a single reset pill when filters are the cause.

### Verification

- Rerun the production build after each pass.
- Confirm 320px reflow of the new toolbar and card actions.
- Confirm hairline dividers meet the 3:1 essential boundary requirement or are decorative and paired with other structure.
- Confirm rating glyphs still communicate through label plus icon, never color alone.
