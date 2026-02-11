import { DEFAULT_SETTINGS, MESSAGE_TYPES } from "../shared/constants.js";
import { createStableId, normalizeSharePointUrl } from "../shared/url.js";
import { downloadTranscript } from "./downloads.js";
import { addUrls, processQueue, queueStatus, retryItem } from "./queue.js";
import { ensureDefaults, getState, setHistory, setSettings } from "./storage.js";

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab.url?.includes("sharepoint.com")) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.START_EXTRACT, url: tab.url });
    if (response?.type === MESSAGE_TYPES.TRANSCRIPT_FOUND) {
      await recordDownload(response, tab.url);
    }
  } catch (err) {
    console.error("Action click extraction failed", err);
  }
});

async function recordDownload(response, sourceUrl) {
  const result = await downloadTranscript(response);
  const { history } = await getState();
  let normalized = sourceUrl;
  try {
    normalized = normalizeSharePointUrl(sourceUrl);
  } catch {
    // keep source URL as fallback key input
  }
  const key = createStableId(normalized);

  if (result.ok) {
    const entry = {
      url: normalized,
      transcriptId: response.transcriptId,
      downloadedAt: Date.now(),
      filename: result.filename,
      status: "done"
    };
    history[key] = entry;
    if (response.transcriptId) history[response.transcriptId] = entry;
  } else {
    history[key] = {
      url: normalized,
      transcriptId: response.transcriptId,
      downloadedAt: Date.now(),
      filename: "",
      status: "failed",
      reason: result.errorCode
    };
  }

  await setHistory(history);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;

  (async () => {
    if (type === MESSAGE_TYPES.ADD_URLS) {
      const result = await addUrls(message.urls || []);
      sendResponse({ ok: true, ...result });
      return;
    }

    if (type === MESSAGE_TYPES.RUN_QUEUE) {
      const result = await processQueue();
      sendResponse(result);
      return;
    }

    if (type === MESSAGE_TYPES.GET_STATUS) {
      const { settings } = await getState();
      const status = await queueStatus();
      sendResponse({ ok: true, settings, ...status });
      return;
    }

    if (type === "SAVE_SETTINGS") {
      await setSettings({ ...DEFAULT_SETTINGS, ...(message.settings || {}) });
      sendResponse({ ok: true });
      return;
    }

    if (type === MESSAGE_TYPES.RETRY_ITEM) {
      const ok = await retryItem(message.id);
      sendResponse({ ok });
      return;
    }

    if (type === MESSAGE_TYPES.PAGE_DOWNLOAD_REQUEST) {
      const tabId = sender?.tab?.id;
      const tabUrl = sender?.tab?.url || message.url;
      if (!tabId) {
        sendResponse({ ok: false, reason: "No tab context" });
        return;
      }

      const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.START_EXTRACT, url: tabUrl });
      if (response?.type !== MESSAGE_TYPES.TRANSCRIPT_FOUND) {
        sendResponse({ ok: false, reason: response?.reason || "No transcript" });
        return;
      }

      const saved = await recordDownload(response, tabUrl);
      sendResponse({ ok: saved.ok, reason: saved.errorMessage || "" });
      return;
    }

    sendResponse({ ok: false, reason: "Unsupported message type" });
  })().catch((err) => {
    console.error("Message handling error", err);
    sendResponse({ ok: false, reason: err?.message || String(err) });
  });

  return true;
});
