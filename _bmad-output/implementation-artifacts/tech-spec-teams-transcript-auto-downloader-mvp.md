---
title: 'Teams Transcript Auto-Downloader (Chrome Extension) MVP'
slug: 'teams-transcript-auto-downloader-mvp'
created: 'Wed Feb 11 11:06:46 EST 2026'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['JavaScript', 'Chrome Extension MV3', 'Content Scripts', 'Background Service Worker', 'chrome.storage.local', 'chrome.downloads']
files_to_modify: ['dl_teams_transcript.js', 'prd.md']
code_patterns: ['Tampermonkey userscript patterns (GM_registerMenuCommand, unsafeWindow)', 'SharePoint transcript fetch via authenticated browser session', 'Token discovery via window globals (g_fileInfo, _spPageContextInfo, playbackToken)']
test_patterns: []
---

# Tech-Spec: Teams Transcript Auto-Downloader (Chrome Extension) MVP

**Created:** Wed Feb 11 11:06:46 EST 2026

## Overview

### Problem Statement

Downloading Teams meeting transcripts from Stream-on-SharePoint pages is manual, repetitive, and error-prone. The goal is hands-off, browser-only automation (no OAuth/app registration) that reliably downloads transcripts with meaningful filenames.

### Solution

Build a Chrome MV3 extension that collects recording links, queues them, opens SharePoint/Stream recording pages, extracts transcripts using the authenticated browser session, downloads `.txt` files, and tracks history to prevent duplicates. It also supports click-to-download when the user is on a recording page.

### Scope

**In Scope:**
- SharePoint recording page transcript extraction + download
- Queue-driven batch processing with dedup/history
- Manual “Add URLs” to queue
- Basic settings page (enable/disable, run now, lookback, throttling, close tab toggle)
- Click-to-download from a recording page
- File naming includes scheduled start time when available

**Out of Scope:**
- Microsoft Graph / OAuth app registration
- Tenant/admin policy changes
- Perfect transcript formatting beyond Microsoft output
- Safari support
- Teams web collector (post-MVP)

## Context for Development

### Codebase Patterns

- Confirmed clean slate (no extension code yet).
- Seed logic from the Tampermonkey script in `dl_teams_transcript.js` which fetches transcript lists and stream content from SharePoint using page globals and authenticated fetch.
- Userscript patterns and SharePoint API endpoints can be ported into MV3 content scripts and/or an injected page bridge.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| prd.md | Product requirements and scope |
| dl_teams_transcript.js | Known working transcript download logic |

### Technical Decisions

- Chrome MV3 extension; background service worker orchestrates queue, downloads, scheduling.
- Content script on `https://*.sharepoint.com/*` handles transcript extraction using browser-authenticated requests.
- Page-context access is required for certain globals/tokens; use an injected bridge if needed.
- Queue/history stored in `chrome.storage.local`.
- Downloads via `chrome.downloads` with stable, sanitized filenames and collision handling.
- Volume assumption: ~5 transcripts/day; user runs it for a day at a time.
- File naming must include scheduled meeting start time when available.
- Storage schema (chrome.storage.local):
  - `settings`: `{ enabled: boolean, closeTab: boolean, throttleMs: number, lookbackDays: number, allowRedownload: boolean }`
  - `queue`: `[{ id: string, url: string, addedAt: number, status: 'pending'|'running'|'done'|'failed', lastError?: string, attempts: number }]`
  - `history`: `{ [key: string]: { url: string, transcriptId?: string, downloadedAt: number, filename: string, status: 'done'|'failed', reason?: string } }`
- Messaging contract (content → background):
  - `TRANSCRIPT_FOUND`: `{ url, transcriptId, meetingTitle, scheduledStart?: string, transcriptText }`
  - `TRANSCRIPT_NOT_FOUND`: `{ url, reason }`
  - `TRANSCRIPT_ERROR`: `{ url, reason, detail? }`
- Scheduled start time source (v0.1):
  - Parse from SharePoint page `<title>` using the pattern like `Call with Chris Patten-20260211_093510-Meeting Transcript.mp4`.
  - Accept the value as-is (no timezone conversion).
  - If unavailable, omit time and fall back to date/title-only naming.
- Queue processing rules:
  - Per-item timeout: 45s; max attempts: 2; backoff: 5s.
  - Success = `TRANSCRIPT_FOUND` + download completion event.
  - Failure = timeout, `TRANSCRIPT_NOT_FOUND`, or `TRANSCRIPT_ERROR`.
- Error taxonomy: `auth-required`, `no-transcript`, `network-failure`, `fetch-failed`, `parse-failed`, `download-failed`.
- Filename collision strategy: sanitize then set `conflictAction: 'uniquify'` in `chrome.downloads.download`.
- Filename format: `YYYY-MM-DD HHMM - {Meeting Title}.txt` (time from title; if missing, `YYYY-MM-DD - {Meeting Title}.txt`).
- Queue `id` generation: use `sha256(url)` (or a deterministic hash) to ensure stable dedupe keys.
- History key: use `transcriptId` when present; otherwise fall back to `sha256(url)`.
- Download completion detection: use `chrome.downloads.onChanged` and confirm `state: 'complete'` or `error` for failure.
- Click-to-download dedupe policy: if history indicates `done`, prompt/notify and skip unless `allowRedownload` is true.
- Logging: use `console.info/warn/error` in background + store last error in `history` for UI display.
- URL validation: ignore non-SharePoint URLs; show a count of accepted vs rejected in UI.
- Queue size limit: cap at 200 items per run; excess stays in storage but not processed in that run.
- MV3 service worker: set `background.service_worker` and `type: 'module'` in manifest.
- Tests: add `scripts/test.js` to run minimal unit tests for filename sanitization and transcript formatting.
- Project structure/tooling:
  - Plain JS (no bundler) with module-compatible files; service worker uses ES modules.
  - Directory layout: `src/background/*`, `src/content/*`, `src/shared/*`, `src/ui/*`.
- Host permissions:
  - Start with `https://*.sharepoint.com/*`; note as a known limitation if tenant uses custom domains.
- Multi-transcript selection:
  - Default+visible → visible → first; log if multiple and which selected.
- MV3 injection approach:
  - Prefer `chrome.scripting.executeScript` to access page globals and pass back via `postMessage`; avoid inline script to satisfy CSP.
- Minimal automated tests:
  - Unit tests for filename sanitization and transcript formatter.

## Implementation Plan

### Tasks

- [x] Task 1: Bootstrap MV3 extension skeleton and storage schema
  - File: `manifest.json`
  - Action: Define MV3 manifest with permissions (`downloads`, `storage`, `alarms`, `tabs`, `scripting`), host permissions for `https://*.sharepoint.com/*`, background service worker, content script matches, and UI pages.
  - Notes: Keep scope to MVP; schedule/alarms can be stubbed but not wired unless needed.
- [x] Task 2: Port transcript fetch logic to content script + page bridge
  - File: `src/content/sharepoint.js`
  - Action: Detect SharePoint recording pages, gather page globals (via injected bridge if required), and implement transcript list + stream content fetch based on `dl_teams_transcript.js`.
  - Notes: Preserve selection order (default+visible → visible → first). Use authenticated fetch with tokens from `g_fileInfo`, `_spPageContextInfo.authToken`, or `playbackToken`.
- [x] Task 3: Build transcript parsing and formatting utility
  - File: `src/shared/transcript.js`
  - Action: Convert transcript JSON into readable `.txt` with speaker + offset formatting similar to Tampermonkey script.
  - Notes: Preserve time offset formatting rules (ticks/ms/seconds handling).
- [x] Task 4: Filename + download handling in background
  - File: `src/background/downloads.js`
  - Action: Receive transcript text + metadata from content script, sanitize filename, include scheduled meeting start time when available, and trigger `chrome.downloads.download`.
  - Notes: Implement collision handling (auto-uniquify) and record history entries.
- [x] Task 5: Queue + history orchestration
  - File: `src/background/queue.js`
  - Action: Maintain queue in `chrome.storage.local`, dedupe by recording URL/transcript ID, process sequentially with throttling, open tab per item, await success/failure, close tab per setting.
  - Notes: Persist queue and history across restarts, support manual retry, capture error reasons.
- [x] Task 6: Manual Add URLs + Settings UI (MVP)
  - File: `src/ui/options.html`
  - Action: Provide textarea to paste recording URLs, settings toggles, “Run now” button, and status (queue size, last run, last error).
  - Notes: Settings include enable/disable, close tab, throttling, lookback (stored for future collector).
- [x] Task 7: Click-to-download on recording page
  - File: `src/content/sharepoint.js`
  - Action: Inject a lightweight UI button or bind to extension action to trigger immediate download from current page.
  - Notes: Should bypass queue and save immediately, still recorded in history/dedup.
- [x] Task 8: Define storage schema and messaging contract
  - File: `src/shared/constants.js`
  - Action: Add schema defaults, message types, and error codes used by content + background.
  - Notes: Align with the Technical Decisions schema to prevent drift.
- [x] Task 9: Add minimal test harness for shared utilities
  - File: `scripts/test.js`
  - Action: Implement basic assertions for filename sanitizer and transcript formatter utilities.
  - Notes: Keep it dependency-free (node + simple assertions).

### Acceptance Criteria

- [ ] AC 1: Given the user pastes valid SharePoint recording URLs into the UI, when “Run now” is clicked, then the queue processes sequentially and downloads transcripts for each item.
- [ ] AC 2: Given a SharePoint recording page with a transcript, when the user clicks the in-page “Download transcript” button, then a `.txt` file downloads within 30 seconds under normal network conditions.
- [ ] AC 3: Given a recording with no transcript, when processing it, then the item is marked failed with a clear “no transcript” reason and no infinite retry loop occurs.
- [ ] AC 4: Given a transcript already downloaded, when the same recording URL is re-queued, then it is skipped unless the user explicitly forces re-download.
- [ ] AC 5: Given transcript metadata contains a scheduled meeting start time, when the file is downloaded, then the filename includes that start time; otherwise it falls back to date/title parsing.
- [ ] AC 6: Given browser restarts, when the user returns, then queue/history/settings persist in `chrome.storage.local`.
- [ ] AC 7: Given multiple queue items, when processing, then only one background tab is opened at a time and closed if the setting is enabled.
- [ ] AC 8: Given a processing timeout or network error, when a queue item fails, then it is marked failed with a standardized error code and can be retried once automatically.

## Additional Context

### Dependencies

None beyond Chrome extension APIs and SharePoint endpoints accessed via the authenticated browser session.

### Testing Strategy

- Manual: Use a real SharePoint recording page with transcripts to validate fetch, download, and naming.
- Manual: Test “no transcript” scenario to verify error handling and history logging.
- Manual: Verify dedup by re-running the same URL and ensuring it is skipped.
- Manual: Validate queue persistence by restarting the browser mid-queue.

### Notes

- Risk: SharePoint DOM or API shapes can change; isolate selectors and log failures clearly.
- Future: Outlook/Teams collectors and scheduled runs are out of scope for MVP but settings are stored for forward compatibility.

## Review Notes

- Adversarial review completed
- Findings: 10 total, 10 fixed, 0 skipped
- Resolution approach: auto-fix
