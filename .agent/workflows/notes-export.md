# Notes Export Workflow

Goal: read the shared `Concerts` notes from Apple Notes, export them into a stable local artifact, and display the exported content reliably.

## Scope

- Primary source: Apple Notes on macOS
- Primary automation path: JavaScript for Automation via `osascript -l JavaScript`
- Preferred output artifact: `data/notes/concerts.json`
- Preferred consumer: opencode reads the exported artifact rather than depending on live Notes state each time

## Recommended Stack

This task should use the smallest native macOS stack that still gives us reliable structured output.

### Core Stack

- `osascript -l JavaScript`: primary automation runtime for reading Notes through Apple Events
- Apple Notes scripting dictionary: source of available note, folder, and account objects
- `zsh`: local shell wrapper for running probes and export commands on macOS
- JSON export artifact: stable machine-readable output at `data/notes/concerts.json`
- opencode file reads: final display path back to the user

### Why This Stack

- `osascript` is the native supported command-line bridge into scriptable macOS apps.
- JavaScript for Automation is preferred over raw AppleScript when the output needs to become JSON.
- JSON is the simplest durable artifact for note title, body, folder, account, and modified date.
- This keeps the workflow dependency-light and avoids introducing Node packages, Python packages, or database access.

### Fallback Stack

- `shortcuts run ...`: fallback when Notes scripting is insufficient but a Shortcut can export the needed content
- manual Notes export/share: fallback when automation is blocked by permissions or shared-note limitations
- `System Events`: last-resort UI scripting only if both direct scripting and Shortcuts fail

### Explicit Non-Goals For V1

- no direct access to Notes internal databases
- no OCR, scraping, or browser automation
- no new package dependencies
- no background daemon or sync service

### Tool Roles

- `osascript -l JavaScript`: inspect Notes availability and export note data
- `shortcuts`: optional fallback runner that can produce file output from a Shortcut
- repo file path `data/notes/concerts.json`: handoff boundary between macOS automation and project consumption
- `.agent/runs/notes-export.json`: progress and verification state

### Required macOS Conditions

- Notes is installed and the shared `Concerts` notes are visible locally
- iCloud/shared-note sync is current
- Automation permission is granted for the terminal/opencode host to control Notes
- Accessibility permission is only needed if UI scripting is used

## Loop

### 1. Inspect

Questions to answer before changing anything:

- Are the `Concerts` notes in a shared folder, individual shared notes, or matched by title?
- Are the notes already visible in the local Notes app on this Mac?
- Is Notes synced and up to date?
- Is Notes scripting likely to work for the target notes on this macOS version?

Outputs from inspect:

- a confirmed selection rule for target notes
- known app-state requirements
- known permission requirements
- initial blockers recorded in `.agent/runs/notes-export.json`

### 2. Plan

Make the smallest workable plan based on inspect results.

Plan checklist:

- prefer direct Notes scripting over UI scripting
- prefer `osascript -l JavaScript` when structured export output is needed
- keep the export format plain and repo-friendly
- define exactly what fields to export
- define the smallest verification step that proves the export works

Expected plan result:

- target query rule
- output format
- refresh command or script shape
- verification checklist

### 3. Act

Implement one small step at a time.

Typical action order:

1. run a non-destructive Notes access probe
2. confirm the query can see the target notes
3. create a minimal JXA exporter
4. write the exported artifact to `data/notes/concerts.json`
5. add any needed workflow docs or commands

Rules:

- avoid touching internal Notes storage
- avoid UI scripting unless the primary path fails
- keep macOS-specific assumptions explicit

### 4. Verify

Verify after each meaningful action.

Verification checklist:

- Notes query succeeds without relying on brittle UI state
- exported note count matches expectation
- at least one exported note body matches Notes manually
- shared notes remain readable after sync refresh
- failure messages are clear when permissions or sync are missing

Verification evidence should update:

- `last_verification.status`
- `last_verification.details`
- `completed_steps`

### 5. Update State

After inspect, plan, act, or verify, update `.agent/runs/notes-export.json`.

Always keep current:

- `status`
- `current_step`
- `completed_steps`
- `blockers`
- `last_verification`
- `next_action`

Status guidance:

- `planned`: workflow defined, work not started
- `in_progress`: currently executing a step
- `blocked`: waiting on permissions, sync, or user clarification
- `verified`: export works for the current scope

## First Execution Target

The first implementation pass should only aim to prove these points:

1. AppleScript can query Apple Notes on this Mac.
2. The shared `Concerts` notes are visible to the query.
3. A minimal export artifact can be written and read back.

Anything beyond that should wait until the primary path is proven.
