---
name: ui-design-system
description: Use when editing or reviewing Jenny Concert Website UI colors, surfaces, typography, cards, search, filters, dialogs, responsive behavior, or accessibility in frontend/src/App.jsx, frontend/src/index.css, or frontend/tailwind.config.js.
---

# Jenny Concert UI Design System

Use `frontend/UI_DESIGN_PLAN.md` as the full design contract. Preserve the modern concert journal direction unless the user explicitly approves a new direction.

## Visual Identity

- Let reviewed artist photography, venue photography, and generated 4:5 concert posters provide most of the color and energy.
- Keep surrounding UI calm, warm, editorial, and highly readable.
- Use the warm canvas, light surfaces, vivid cobalt identity color, and restrained terracotta accent.
- Reserve rating colors for icon-and-text badges. Never tint an entire card by rating.
- Avoid multicolored hard shadows, black outlines, gradients, glass effects, and decorative color that competes with poster art.

## Token Rules

- Use semantic colors from `frontend/tailwind.config.js` and CSS variables from `frontend/src/index.css`.
- Do not add literal UI hex colors to React components.
- The direct color values in `frontend/src/lib/concert-enrichment.js` belong to generated poster artwork and are intentionally separate.
- Use only reviewed photography from `frontend/src/data/concert-media.json`; preserve its source, creator, license, and modification fields.
- Use `canvas`, `surface`, and `surface-muted` for the surface ladder.
- Use `ink` and `ink-muted` for readable text.
- Use `control-border` for essential boundaries and `border` for decorative dividers.
- Use `primary` for identity and selected states, `accent` for editorial emphasis, `focus` for keyboard focus, and `gold` only for small decorative details.
- Use neutral `shadow-card` and `shadow-dialog`; do not color shadows by state or rating.

## Type and Spacing

- Use Source Sans 3 for body copy, controls, labels, and metadata.
- Use League Gothic only for the site title, page headings, artist headings, and concise empty-state headings.
- Keep body and control text at 16px or larger and essential labels at 14px or larger.
- Use sentence case for controls. Reserve uppercase and tracking for short editorial eyebrows and display headings.
- Follow the 8px spacing rhythm documented in the design plan.
- Use 44px minimum practical touch targets and 48px form controls.
- Use the shared `page-gutter` and `dialog-content-gutter` classes so device safe areas remain respected.

## Component Rules

- Cards use one light surface, one neutral border, and one neutral shadow.
- Preserve 4:5 card art; use `object-cover` for reviewed photography and never crop generated poster text.
- Vary poster colors and motifs deterministically so neighboring entries remain visually distinct.
- Use a compact ticket row for rating, available metadata, and the visible details action; do not repeat the artist visibly below generated poster art.
- Show complete media attribution in details and a visible photo-credit action anywhere licensed photography appears on a card.
- Keep `seen`, `upcoming`, and `wishlist` as distinct collections.
- Structure cards as articles with a semantic artist heading and a visible, uniquely named details button.
- Keep search visible. Collapse filters through tablet widths and show the compact toolbar from 960px.
- Pair selected collection styling with `aria-pressed`.
- Announce result changes through the debounced live region.
- Keep the mobile dialog close action visible in a real sticky header.
- Use full-screen mobile dialog behavior, side-by-side short-landscape/tablet behavior, `100dvh`, safe-area padding, focus containment, and inert background content.
- Do not show venue actions when no real venue is present.
- Omit empty future-feature panels that distract from available concert information.

## Accessibility Requirements

- Meet WCAG 2.2 AA: 4.5:1 normal text, 3:1 large text, focus, and essential boundaries.
- Never remove focus styling without an equivalent wrapper-level treatment.
- Do not communicate state with color alone.
- Keep generated poster images decorative when the semantic artist heading provides the same name.
- Keep card artwork decorative when the semantic artist heading provides the same name.
- Restore focus after dialogs and after reset actions that unmount their trigger.
- Support keyboard navigation, Escape, reduced motion, 320px reflow, and 400% zoom.
- Identify links that open new tabs in their accessible names.

## Change Workflow

1. Read the nearby component and the full design plan before editing.
2. Reuse semantic tokens and established component patterns.
3. Check portrait mobile, short landscape, tablet, and desktop behavior.
4. Verify focus, contrast, touch targets, live states, and dialog behavior.
5. Search for accidental literal UI colors and legacy color utilities.
6. Run `npm run build` from `frontend/`.
7. When media sources change, run `npm run media:concerts` from the project root and review every downloaded image before shipping.

Do not add dependencies or a separate designer agent for routine UI work. Use this skill as the consistency layer and use a review subagent only for an independent audit when a change is substantial.
