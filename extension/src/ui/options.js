const MESSAGE_TYPES = {
  ADD_URLS: "ADD_URLS",
  GET_STATUS: "GET_STATUS",
  RUN_QUEUE: "RUN_QUEUE"
};

function byId(id) {
  return document.getElementById(id);
}

function readSettingsFromForm() {
  return {
    enabled: byId("enabled").checked,
    closeTab: byId("closeTab").checked,
    allowRedownload: byId("allowRedownload").checked,
    throttleMs: Number(byId("throttleMs").value || 0),
    lookbackDays: Number(byId("lookbackDays").value || 1)
  };
}

function writeSettingsToForm(settings) {
  byId("enabled").checked = Boolean(settings.enabled);
  byId("closeTab").checked = Boolean(settings.closeTab);
  byId("allowRedownload").checked = Boolean(settings.allowRedownload);
  byId("throttleMs").value = Number(settings.throttleMs || 0);
  byId("lookbackDays").value = Number(settings.lookbackDays || 1);
}

async function refreshStatus() {
  const res = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_STATUS });
  if (!res?.ok) {
    byId("status").textContent = "Failed to load status";
    return;
  }

  writeSettingsToForm(res.settings || {});

  const queue = (res.queue || []).map((item) => {
    const err = item.lastError ? ` (${item.lastError})` : "";
    return `- ${item.status.padEnd(7)} ${item.url}${err}`;
  });

  byId("status").textContent = [
    `Queue size: ${res.queueSize}`,
    `History entries: ${res.historyCount}`,
    "",
    "Queue:",
    ...(queue.length ? queue : ["- empty"])
  ].join("\n");
}

async function addUrls() {
  const lines = byId("urls").value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const res = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.ADD_URLS,
    urls: lines
  });

  byId("status").textContent = `Added: ${res?.accepted?.length || 0}\nRejected: ${res?.rejected?.length || 0}`;
  byId("urls").value = "";
  await refreshStatus();
}

async function runQueue() {
  byId("status").textContent = "Running queue...";
  await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.RUN_QUEUE });
  await refreshStatus();
}

async function saveSettings() {
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: readSettingsFromForm() });
  await refreshStatus();
}

byId("addUrls").addEventListener("click", () => addUrls().catch(console.error));
byId("runQueue").addEventListener("click", () => runQueue().catch(console.error));
byId("refresh").addEventListener("click", () => refreshStatus().catch(console.error));
byId("saveSettings").addEventListener("click", () => saveSettings().catch(console.error));

refreshStatus().catch(console.error);
