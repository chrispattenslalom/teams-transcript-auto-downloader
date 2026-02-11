import { DEFAULT_SETTINGS, HISTORY_KEY, QUEUE_KEY, SETTINGS_KEY } from "../shared/constants.js";

export async function getState() {
  const raw = await chrome.storage.local.get([SETTINGS_KEY, QUEUE_KEY, HISTORY_KEY]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(raw[SETTINGS_KEY] || {}) },
    queue: Array.isArray(raw[QUEUE_KEY]) ? raw[QUEUE_KEY] : [],
    history: raw[HISTORY_KEY] || {}
  };
}

export async function setQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

export async function setHistory(history) {
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

export async function setSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, ...(settings || {}) } });
}

export async function ensureDefaults() {
  const state = await getState();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: state.settings,
    [QUEUE_KEY]: state.queue,
    [HISTORY_KEY]: state.history
  });
}
