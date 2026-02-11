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

- `dist/teams-transcript-auto-downloader-v<version>.zip`

The archive is built from `extension/` and contains `manifest.json` at the zip root.

## Release Workflow (GitHub)

1. Update version:

```bash
make version
```

2. Build release artifact:

```bash
make dist
```

3. Commit updated files plus the new `dist/*.zip`.
4. Create/publish a GitHub Release and attach the zip from `dist/`.

## User Install from GitHub Release Zip

1. Download `dist/teams-transcript-auto-downloader-v<version>.zip` from the GitHub release assets.
2. Unzip it to a local folder.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped folder (the folder containing `manifest.json`).

## User Updates When New Versions Are Published

Chrome does not auto-update unpacked extensions from GitHub releases.

Users update manually:

1. Download and unzip the newer release zip.
2. Open `chrome://extensions`.
3. Click **Reload** on the extension card if the folder path is unchanged.
4. If the folder path changed, use **Load unpacked** and select the new unzipped folder.

## Notes

- `make version` keeps `manifest.json`, `extension/manifest.json`, and `package.json` in sync.
- The extension currently targets SharePoint-hosted recordings (`https://*.sharepoint.com/*`).
