(function () {
  "use strict";

  const TO_BRIDGE = "teams-transcript-content";
  const FROM_BRIDGE = "teams-transcript-bridge";
  const START_EXTRACT = "START_EXTRACT";
  const PAGE_DOWNLOAD_REQUEST = "PAGE_DOWNLOAD_REQUEST";

  const pending = new Map();

  function ensureBridgeLoaded() {
    if (document.getElementById("teams-transcript-bridge")) return;
    const script = document.createElement("script");
    script.id = "teams-transcript-bridge";
    script.src = chrome.runtime.getURL("src/content/page-bridge.js");
    (document.head || document.documentElement).appendChild(script);
  }

  function createRequestId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showToast(message, isError) {
    const el = document.createElement("div");
    el.textContent = message;
    el.style.position = "fixed";
    el.style.right = "16px";
    el.style.bottom = "16px";
    el.style.zIndex = "2147483647";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "8px";
    el.style.color = "#fff";
    el.style.background = isError ? "#8b1e1e" : "#14532d";
    el.style.font = "13px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function requestExtract(url) {
    return new Promise((resolve) => {
      const requestId = createRequestId();
      pending.set(requestId, resolve);
      window.postMessage({ source: TO_BRIDGE, requestId, url }, "*");
    });
  }

  async function runPageDownload() {
    const response = await chrome.runtime.sendMessage({
      type: PAGE_DOWNLOAD_REQUEST,
      url: window.location.href
    });

    if (response?.ok) {
      showToast("Transcript downloaded", false);
    } else {
      showToast(response?.reason || "Transcript download failed", true);
    }
  }

  function shouldInjectButton() {
    const path = String(window.location.pathname || "").toLowerCase();
    const title = String(document.title || "").toLowerCase();
    return (
      path.includes("stream.aspx") ||
      path.includes("/recording") ||
      title.includes("meeting transcript")
    );
  }

  function injectButton() {
    if (document.getElementById("teams-transcript-download-btn")) return;

    const button = document.createElement("button");
    button.id = "teams-transcript-download-btn";
    button.textContent = "Download transcript";
    button.style.position = "fixed";
    button.style.right = "16px";
    button.style.top = "16px";
    button.style.zIndex = "2147483647";
    button.style.padding = "8px 10px";
    button.style.background = "#0b5a74";
    button.style.color = "#fff";
    button.style.border = "none";
    button.style.borderRadius = "8px";
    button.style.cursor = "pointer";
    button.style.font = "13px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    button.addEventListener("click", () => {
      runPageDownload().catch((err) => showToast(err?.message || String(err), true));
    });

    document.body.appendChild(button);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== FROM_BRIDGE) return;
    const resolve = pending.get(event.data.requestId);
    if (!resolve) return;
    pending.delete(event.data.requestId);
    resolve(event.data.payload);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== START_EXTRACT) return;

    requestExtract(message.url || window.location.href)
      .then((payload) => sendResponse(payload))
      .catch((err) => {
        sendResponse({
          type: "TRANSCRIPT_ERROR",
          reason: "parse-failed",
          detail: err?.message || String(err)
        });
      });

    return true;
  });

  ensureBridgeLoaded();
  if (shouldInjectButton()) {
    injectButton();
  }
})();
