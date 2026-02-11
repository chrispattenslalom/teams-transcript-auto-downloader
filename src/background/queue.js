import {
  BACKOFF_MS,
  ERROR_CODES,
  ITEM_TIMEOUT_MS,
  MAX_ATTEMPTS,
  MESSAGE_TYPES,
  QUEUE_LIMIT_PER_RUN
} from "../shared/constants.js";
import { createStableId, normalizeSharePointUrl } from "../shared/url.js";
import { downloadTranscript } from "./downloads.js";
import { getState, setHistory, setQueue } from "./storage.js";

let running = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createQueueId(url) {
  return createStableId(url);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(ERROR_CODES.TIMEOUT)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function waitTabComplete(tabId, timeoutMs = 15000) {
  const current = await chrome.tabs.get(tabId);
  if (current?.status === "complete") return;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("tab-load-timeout"));
    }, timeoutMs);

    const onUpdated = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function mapErrorCode(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("timeout")) return ERROR_CODES.TIMEOUT;
  if (msg.includes("auth")) return ERROR_CODES.AUTH_REQUIRED;
  if (msg.includes("network")) return ERROR_CODES.NETWORK_FAILURE;
  if (msg.includes("fetch")) return ERROR_CODES.FETCH_FAILED;
  if (msg.includes("parse")) return ERROR_CODES.PARSE_FAILED;
  if (msg.includes("transcript")) return ERROR_CODES.NO_TRANSCRIPT;
  return ERROR_CODES.UNKNOWN;
}

export async function addUrls(rawUrls) {
  const { queue } = await getState();
  const accepted = [];
  const rejected = [];
  const pendingUrls = new Set(
    queue
      .map((item) => {
        try {
          return normalizeSharePointUrl(item.url);
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );

  for (const raw of rawUrls || []) {
    const candidate = String(raw || "").trim();
    if (!candidate) continue;

    try {
      const u = new URL(candidate);
      if (!u.hostname.endsWith("sharepoint.com")) {
        rejected.push(candidate);
        continue;
      }
      const normalized = normalizeSharePointUrl(u.toString());
      if (pendingUrls.has(normalized)) continue;

      const item = {
        id: createQueueId(normalized),
        url: normalized,
        addedAt: Date.now(),
        status: "pending",
        attempts: 0
      };
      queue.push(item);
      pendingUrls.add(normalized);
      accepted.push(normalized);
    } catch {
      rejected.push(candidate);
    }
  }

  await setQueue(queue);
  return { accepted, rejected };
}

export async function retryItem(id) {
  const { queue } = await getState();
  const found = queue.find((item) => item.id === id);
  if (!found) return false;
  found.status = "pending";
  found.lastError = "";
  found.attempts = 0;
  await setQueue(queue);
  return true;
}

export async function queueStatus() {
  const { queue, history } = await getState();
  return {
    queue,
    queueSize: queue.filter((q) => q.status === "pending" || q.status === "running").length,
    historyCount: Object.keys(history).length
  };
}

async function processOne(item, settings, history) {
  const tab = await chrome.tabs.create({ url: item.url, active: false });

  try {
    await waitTabComplete(tab.id);
    const response = await withTimeout(
      chrome.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.START_EXTRACT,
        url: item.url
      }),
      ITEM_TIMEOUT_MS
    );

    if (!response || response.type !== MESSAGE_TYPES.TRANSCRIPT_FOUND) {
      return {
        ok: false,
        code: response?.reason || ERROR_CODES.NO_TRANSCRIPT,
        detail: response?.detail || "Transcript unavailable"
      };
    }

    const download = await downloadTranscript(response);
    if (!download.ok) {
      return {
        ok: false,
        code: download.errorCode,
        detail: download.errorMessage
      };
    }

    const urlKey = createQueueId(item.url);
    const entry = {
      url: item.url,
      transcriptId: response.transcriptId,
      downloadedAt: Date.now(),
      filename: download.filename,
      status: "done"
    };
    history[urlKey] = entry;
    if (response.transcriptId) history[response.transcriptId] = entry;

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: mapErrorCode(err),
      detail: err?.message || String(err)
    };
  } finally {
    if (settings.closeTab) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // ignore tab cleanup failures
      }
    }
  }
}

export async function processQueue() {
  if (running) return { ok: true, skipped: true };
  running = true;

  try {
    const state = await getState();
    const { settings, queue, history } = state;
    if (!settings.enabled) return { ok: true, skipped: true };

    const processable = queue.filter((q) => q.status === "pending").slice(0, QUEUE_LIMIT_PER_RUN);

    for (const item of processable) {
      try {
        item.url = normalizeSharePointUrl(item.url);
      } catch {
        item.status = "failed";
        item.lastError = `${ERROR_CODES.PARSE_FAILED}: invalid URL`;
        await setQueue(queue);
        continue;
      }

      const historyKey = createQueueId(item.url);
      if (!settings.allowRedownload && history[historyKey]?.status === "done") {
        item.status = "done";
        await setQueue(queue);
        continue;
      }

      item.status = "running";
      item.attempts = Number(item.attempts || 0) + 1;
      await setQueue(queue);

      const result = await processOne(item, settings, history);
      if (result.ok) {
        item.status = "done";
        item.lastError = "";
      } else if (item.attempts < MAX_ATTEMPTS) {
        item.status = "pending";
        item.lastError = `${result.code}: ${result.detail}`;
        await setQueue(queue);
        await sleep(BACKOFF_MS);
        continue;
      } else {
        item.status = "failed";
        item.lastError = `${result.code}: ${result.detail}`;

        const failKey = historyKey;
        history[failKey] = {
          url: item.url,
          downloadedAt: Date.now(),
          filename: "",
          status: "failed",
          reason: result.code
        };
      }

      await setQueue(queue);
      await setHistory(history);
      await sleep(Math.max(0, Number(settings.throttleMs || 0)));
    }

    return { ok: true };
  } finally {
    running = false;
  }
}
