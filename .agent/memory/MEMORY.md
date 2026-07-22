# Project Memory

Add durable facts here when they are likely to matter across sessions.

## What Belongs Here

- stable project conventions
- recurring environment quirks
- user preferences that affect implementation decisions
- durable Notes/macOS workflow constraints

## What Does Not Belong Here

- full transcripts
- temporary plans
- noisy command output
- one-off debugging details unless they become repeatable knowledge

## Current Facts

- This project uses project-local opencode agents and skills under `.opencode/`.
- Apple Notes and macOS automation are a current focus area.
- For the first Notes export workflow, the preferred implementation stack is native macOS scripting via `osascript -l JavaScript`, exporting structured note data to `data/notes/concerts.json`.
- For upcoming write support, work should target only the test note with title prefix `Test_ABCD1234` until update and rollback behavior are proven safe.
