# AGENTS.md

This file defines repo-specific guidance for coding agents working in this project.

## Scope

Applies to the full repository rooted at `/Users/chris.patten/workspace/transcript_downloader`.

## Project Summary

- Project type: Chrome Extension (Manifest V3)
- Primary goal: queue and download Teams/SharePoint transcript files
- Runtime: browser extension APIs (`chrome.*`)
- Utility tests: Node script at `scripts/test.js`

## Key Paths

- `src/background/`: service worker orchestration, queueing, downloads, storage
- `src/content/`: page integration and extraction bridge
- `src/ui/`: options page UI and controls
- `src/shared/`: shared constants and utility logic
- `manifest.json`: development manifest
- `extension/`: distribution-ready extension folder with mirrored source/manifest

## Required Workflow

1. Make code changes in the main source tree and ensure behavior is correct.
2. Keep distribution files in `extension/` aligned with corresponding root files.
3. Run tests before finalizing:
   - `npm test`
4. For release artifacts, package from `extension/` so `manifest.json` is at zip root.

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
cd /Users/chris.patten/workspace/transcript_downloader/extension
zip -r ../teams-transcript-auto-downloader-v<version>.zip . -x "*.DS_Store" -x "__MACOSX/*"
```
