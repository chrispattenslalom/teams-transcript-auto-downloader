.PHONY: help version dist

help:
	@echo "Available targets:"
	@echo "  make version               # bump patch version (x.y.z -> x.y.(z+1))"
	@echo "  make version VERSION=1.2.3 # set explicit version"
	@echo "  make dist                  # create distribution zip in dist/"

version:
	@TARGET_VERSION="$(VERSION)" node -e ' \
const fs = require("fs"); \
const files = ["extension/manifest.json", "package.json"]; \
const semver = new RegExp("^[0-9]+\\.[0-9]+\\.[0-9]+$$"); \
const current = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8")).version; \
const explicit = (process.env.TARGET_VERSION || "").trim(); \
let next = explicit; \
if (next) { \
  if (!semver.test(next)) { \
    console.error("VERSION must match x.y.z"); \
    process.exit(1); \
  } \
} else { \
  const parts = String(current).split(".").map(Number); \
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) { \
    console.error("Current version is not semver: " + current); \
    process.exit(1); \
  } \
  parts[2] += 1; \
  next = parts.join("."); \
} \
for (const file of files) { \
  const data = JSON.parse(fs.readFileSync(file, "utf8")); \
  data.version = next; \
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n"); \
} \
console.log("Updated version: " + current + " -> " + next); \
'

dist:
	@node -e ' \
const fs = require("fs"); \
const files = ["extension/manifest.json", "package.json"]; \
const versions = files.map((f) => ({ file: f, version: JSON.parse(fs.readFileSync(f, "utf8")).version })); \
const unique = new Set(versions.map((v) => v.version)); \
if (unique.size !== 1) { \
  console.error("Version mismatch detected:"); \
  for (const v of versions) console.error("  " + v.file + ": " + v.version); \
  console.error("Run `make version` first to sync versions."); \
  process.exit(1); \
} \
' 
	@VERSION="$$(node -p "require('./extension/manifest.json').version")"; \
	OUT_DIR="dist"; \
	OUT="$$OUT_DIR/teams-transcript-auto-downloader-v$$VERSION.zip"; \
	mkdir -p "$$OUT_DIR"; \
	rm -f "$$OUT"; \
	cd extension && zip -rq "../$$OUT" . -x "*.DS_Store" -x "__MACOSX/*"; \
	echo "Created $$OUT"
