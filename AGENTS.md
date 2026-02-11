# AGENTS.md

This file defines repo-specific guidance for coding agents working in this project.

## Scope

Applies to the full repository rooted at `/Users/chris.patten/workspace/teams-transcript-auto-downloader`.

## Project Summary

- Project type: Chrome Extension (Manifest V3)
- Primary goal: queue and download Teams/SharePoint transcript files
- Runtime: browser extension APIs (`chrome.*`)
- Utility tests: Node script at `scripts/test.js`

## Key Paths

- `extension/src/background/`: service worker orchestration, queueing, downloads, storage
- `extension/src/content/`: page integration and extraction bridge
- `extension/src/ui/`: options page UI and controls
- `extension/src/shared/`: shared constants and utility logic
- `extension/manifest.json`: canonical extension manifest

## Required Workflow

1. Make code changes in `extension/` and ensure behavior is correct.
2. Run tests before finalizing:
   - `npm test`
3. For release artifacts, package from `extension/` so `manifest.json` is at zip root.

## Change Guardrails

- Preserve Manifest V3 compatibility.
- Do not add external dependencies unless required.
- Keep host permissions narrowly scoped.
- Avoid storing transcript content in extension storage unless explicitly required.
- Maintain deterministic filename and URL normalization behavior in shared utilities.

## Validation Checklist

- `npm test` passes.
- Extension loads unpacked from `extension/` without manifest errors.
- Queue add/run/status flows still work in options page.
- Action click flow still attempts transcript extraction on SharePoint pages.

## Packaging Reminder

Use this sequence:

```bash
cd /Users/chris.patten/workspace/teams-transcript-auto-downloader/extension
zip -r ../teams-transcript-auto-downloader-v<version>.zip . -x "*.DS_Store" -x "__MACOSX/*"
```
