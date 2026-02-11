function pad2(n) {
  return String(n).padStart(2, "0");
}

export function sanitizeFilename(name) {
  return String(name || "Meeting Transcript")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function parseScheduledStartFromTitle(title) {
  const m = String(title || "").match(/-(\d{8}_\d{6})-/);
  return m ? m[1] : "";
}

function toDatePrefix(scheduledStart, now = new Date()) {
  if (!scheduledStart) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  const d = scheduledStart.slice(0, 8);
  const t = scheduledStart.slice(9, 13);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t}`;
}

export function buildTranscriptFilename({ meetingTitle, scheduledStart, now = new Date() }) {
  const safeTitle = sanitizeFilename(meetingTitle || "Meeting Transcript") || "Meeting Transcript";
  const prefix = toDatePrefix(scheduledStart, now);
  return `${prefix} - ${safeTitle}.txt`;
}
