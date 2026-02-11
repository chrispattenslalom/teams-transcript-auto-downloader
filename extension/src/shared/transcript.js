function pad(n) {
  return n < 10 ? `0${n}` : String(n);
}

function fmtSeconds(sec) {
  const v = Math.max(0, Math.floor(sec));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatOffset(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (value.includes(":")) return value.split(".")[0];
    const n = Number(value);
    if (!Number.isNaN(n)) return formatOffset(n);
    return value;
  }

  if (typeof value === "number") {
    let sec = value;
    if (value > 1e12) sec = value / 1e7;
    else if (value > 1e6) sec = value / 1000;
    return fmtSeconds(sec);
  }

  return "";
}

export function normalizeEntries(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.entries)) return data.entries;
  return [];
}

export function formatScheduledStart(scheduledStart, now = new Date()) {
  const raw = String(scheduledStart || "").trim();
  if (/^\d{8}_\d{6}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const hh = raw.slice(9, 11);
    const mm = raw.slice(11, 13);
    const ss = raw.slice(13, 15);
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  if (raw) return raw;

  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function formatTranscriptText({ meetingTitle, scheduledStart, entries, now }) {
  const rows = [meetingTitle || "Meeting Transcript", formatScheduledStart(scheduledStart, now), ""];

  for (const entry of entries || []) {
    rows.push(entry?.speakerDisplayName || "Unknown");
    rows.push(formatOffset(entry?.startOffset));
    rows.push(entry?.text || "");
    rows.push("");
  }

  return rows.join("\n");
}
