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

export function formatTranscriptText({ meetingTitle, entries }) {
  const rows = [meetingTitle || "Meeting Transcript", ""];

  for (const entry of entries || []) {
    rows.push(entry?.speakerDisplayName || "Unknown");
    rows.push(formatOffset(entry?.startOffset));
    rows.push(entry?.text || "");
    rows.push("");
  }

  return rows.join("\n");
}
