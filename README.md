# Teams Transcript Auto-Downloader

Chrome Manifest V3 extension that downloads meeting transcripts from SharePoint-hosted Teams recordings.

## Features

- Adds SharePoint recording URLs to a queue
- Processes queue items in a background service worker
- Downloads transcript text files via authenticated browser session
- Tracks history to prevent duplicate downloads (unless explicitly allowed)
- Supports manual "download from current page" via extension action

## Project Structure

- `src/`: main extension source (background, content, UI, shared utils)
- `manifest.json`: root manifest for local development
- `scripts/test.js`: lightweight Node test script for core utilities
- `extension/`: packaged extension directory for distribution (`manifest.json` at folder root)

## Requirements

- Node.js 18+ (or compatible modern Node runtime)
- Google Chrome (or Chromium-based browser with MV3 support)

## Install Dependencies

This project currently has no runtime npm dependencies, but install metadata and tooling with:

```bash
npm install
```

## Run Tests

```bash
npm test
```

## Release Commands

Use the `Makefile` targets for consistent versioning and packaging:

```bash
# bump patch version across manifest.json, extension/manifest.json, package.json
make version

# or set a specific version
make version VERSION=0.2.0

# build distribution zip (fails if versions are out of sync)
make dist
```

## Load Extension Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/chris.patten/workspace/transcript_downloader/extension`.

## Package for Distribution

Run `make dist` from the repo root. It creates:

- `teams-transcript-auto-downloader-v<version>.zip`

The archive is built from `extension/` and contains `manifest.json` at the zip root, which is the required structure for store upload.

## Notes

- `make version` keeps `manifest.json`, `extension/manifest.json`, and `package.json` in sync.
- The extension currently targets SharePoint-hosted recordings (`https://*.sharepoint.com/*`).
