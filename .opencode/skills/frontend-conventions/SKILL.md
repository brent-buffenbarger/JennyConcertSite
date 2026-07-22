---
name: frontend-conventions
description: Use when working on React, Vite, or Tailwind CSS in this repository, especially for UI design, layout direction, component structure, styling decisions, and avoiding generic AI-generated frontend patterns.
---

# Frontend Conventions

Use this skill for frontend design and implementation work in this repository.

## Primary Stack

- React
- Vite
- Tailwind CSS

## Design Bar

The frontend should feel custom and intentional, not like a generic AI-generated website.

Avoid these patterns unless the project clearly calls for them:

- bland hero-plus-cards layouts
- interchangeable SaaS-style dashboards
- soft gradients with floating decorative blobs
- glassmorphism or ornamental effects without content-driven purpose
- generic spacing/type systems that could belong to any project
- fake marketing sections or filler blocks that do not serve the real content

## Preferred Design Approach

- Let the content shape the layout.
- Use typography, spacing, rhythm, and contrast to create identity.
- Create distinctive page structure before adding decoration.
- Favor strong visual hierarchy over extra UI chrome.
- Keep both mobile and desktop intentionally designed.

## Code Expectations

- Prefer small, readable React components.
- Do not over-abstract early.
- Use Tailwind directly and deliberately.
- Avoid adding helper components or hooks unless repetition clearly justifies them.
- Keep implementation practical and ready for real use.

## Tailwind Guidance

- Keep utility usage disciplined and readable.
- Build a consistent rhythm with spacing and typography choices.
- Prefer compositional clarity over clever class tricks.
- Only introduce custom patterns where they materially improve the UI.

## React Guidance

- Keep state local and minimal by default.
- Prefer straightforward rendering logic.
- Do not add `useMemo` or `useCallback` by default.
- Follow existing project patterns if a frontend structure already exists.

## Page-Building Heuristic

When creating a new screen or page:

1. identify the content or interaction that should feel unique
2. choose a layout direction that highlights that uniqueness
3. establish type scale and spacing rhythm
4. implement the smallest complete version
5. test responsiveness and trim anything ornamental that does not help

## Good Output

- a page that feels specific to this project
- code that is compact and maintainable
- UI that is expressive without being noisy
- a design system that emerges from real screens rather than premature abstraction
