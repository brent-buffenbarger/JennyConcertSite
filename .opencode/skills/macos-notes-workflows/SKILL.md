---
name: macos-notes-workflows
description: Use when work in this repository depends on macOS behavior or Apple Notes workflows including AppleScript, osascript, Shortcuts, permissions, exports, or import automation.
---

# macOS Notes Workflows

Use this skill when the task depends on local macOS behavior or Apple Notes integration.

## Default Approach

- Prefer supported automation over UI scripting.
- Expect macOS permission prompts for Automation, Accessibility, Files and sometimes Full Disk Access.
- Keep workflows resilient to spaces in paths, zsh behavior, and BSD tool differences.
- Prefer export or transformation steps that produce repository-friendly text artifacts.

## Apple Notes Order Of Attack

1. Check whether AppleScript can access the needed Notes data directly.
2. If AppleScript is weak or inconsistent for the task, evaluate a Shortcut-based workflow.
3. If structured automation is still unreliable, use export or share flows.
4. Use UI scripting only as a last resort, and document any assumptions about labels or window state.

## Notes Caveats

- Notes content may depend on iCloud sync state.
- Notes scripting behavior can vary by macOS version.
- Direct access to Notes internal data stores is fragile and should be avoided unless there is no safer option.
- Automation steps may fail until macOS privacy permissions are granted.

## Repository Guidance

- Keep imported or exported content in stable, text-friendly formats when possible.
- Prefer small scripts and clear commands over large automation layers.
- Document any required local setup if the workflow becomes part of the project.

## Good Outputs

- a reproducible `osascript` command
- a Shortcut-based fallback
- a documented permission checklist
- a safe export/import path for Notes-derived content
