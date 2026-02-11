function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

import { buildTranscriptFilename, sanitizeFilename } from "../src/shared/filename.js";
import { formatOffset, formatTranscriptText } from "../src/shared/transcript.js";
import { createStableId, normalizeSharePointUrl } from "../src/shared/url.js";

assert(sanitizeFilename('a/b:c*"d?e<f>g|') === "abcdefg", "sanitizeFilename strips invalid chars");

const fixedDate = new Date("2026-02-11T12:00:00Z");
assert(
  buildTranscriptFilename({
    meetingTitle: "Weekly Sync",
    scheduledStart: "20260211_093510",
    now: fixedDate
  }) === "2026-02-11 0935 - Weekly Sync.txt",
  "buildTranscriptFilename uses scheduled start"
);

assert(
  buildTranscriptFilename({ meetingTitle: "Weekly Sync", scheduledStart: "", now: fixedDate }) ===
    "2026-02-11 - Weekly Sync.txt",
  "buildTranscriptFilename fallback date prefix"
);

assert(formatOffset(3.7) === "00:00:03", "formatOffset seconds");
assert(formatOffset(1230000) === "00:20:30", "formatOffset milliseconds");
assert(formatOffset("00:01:02.123") === "00:01:02", "formatOffset hh:mm:ss string");

const text = formatTranscriptText({
  meetingTitle: "Weekly Sync",
  entries: [
    { speakerDisplayName: "Chris", startOffset: "00:00:05.000", text: "Hello" },
    { speakerDisplayName: "Sam", startOffset: 7, text: "World" }
  ]
});

assert(text.includes("Weekly Sync"), "formatted text includes title");
assert(text.includes("Chris"), "formatted text includes speaker");
assert(text.includes("00:00:07"), "formatted text includes formatted offset");
assert(
  normalizeSharePointUrl("https://tenant.sharepoint.com/path/a/?x=1#frag") ===
    "https://tenant.sharepoint.com/path/a",
  "normalizeSharePointUrl removes search/hash and trailing slash"
);
assert(createStableId("abc") === createStableId("abc"), "createStableId is deterministic");

console.log("All tests passed");
