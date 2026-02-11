# Release Notes

## v0.1.0

Initial public release of **Teams Transcript Auto-Downloader**.

### Highlights

- Added a Manifest V3 Chrome extension that targets SharePoint-hosted Teams recording pages.
- Implemented queue-based transcript download processing in the background service worker.
- Added transcript filename normalization and URL normalization utilities for deterministic outputs.
- Added duplicate-download prevention with optional re-download support.
- Added extension action flow to queue/download from the active SharePoint tab.
- Added an options page for queue visibility and status handling.
- Added release tooling with version sync and zip packaging (`make version`, `make dist`).

### Included in this release

- Canonical extension source and distribution files under `extension/`
- Packaged artifact format: `dist/teams-transcript-auto-downloader-v<version>.zip`
- Documentation and release workflow in `README.md`
- MIT `LICENSE`

### Known limitations

- Scope is currently limited to `https://*.sharepoint.com/*`.
- Browser-based unpacked extension installs do not auto-update from GitHub releases.
