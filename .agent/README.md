# Agent Workspace

This directory holds lightweight local files for agent planning, run state, and curated memory.

## Layout

- `workflows/`: repeatable task loops and checklists
- `runs/`: active task state for resumable work
- `memory/`: durable facts and conventions worth keeping across sessions

## Rules

- Prefer small, human-reviewable files.
- Store current task state in `runs/`.
- Store stable facts in `memory/`, not chat transcripts.
- Update workflow docs when a repeated process becomes clearer.
