## Project Guidance

This repository uses `AGENTS.md` and project-local opencode skills to keep agent behavior consistent.

### Priorities

- Prefer small, direct changes over broad refactors.
- Match existing project structure and naming before introducing new patterns.
- Verify meaningful behavior changes with the smallest relevant check available.
- Avoid adding dependencies, build tooling, or abstractions unless there is a clear need.

### Workflow

- Read the nearby code before editing.
- Keep changes scoped to the request.
- Update or add documentation when behavior or setup changes.
- Call out assumptions when project conventions are missing.

### Agent Workflow Files

- Durable local agent workflow files live under `.agent/`.
- Use `.agent/workflows/` for repeatable task loops and checklists.
- Use `.agent/runs/` for active run state that can be resumed or updated.
- Use `.agent/memory/` for curated, durable facts rather than raw session logs.
- Keep these files small, current, and easy to review.

### Project Skills

- Project-local skills live under `.opencode/skills/`.
- Add focused skills for repeated tasks such as deployment, content updates, design conventions, or release steps.
- Keep each skill narrow and explicit about when it should be used.
