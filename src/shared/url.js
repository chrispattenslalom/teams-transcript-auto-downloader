export function normalizeSharePointUrl(input) {
  const url = new URL(String(input || ""));
  url.search = "";
  url.hash = "";
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export function createStableId(input) {
  let h = 2166136261;
  const text = String(input || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}
