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

  function shouldAttachToolbarButton() {
    const path = String(window.location.pathname || "").toLowerCase();
    const title = String(document.title || "").toLowerCase();
    return (
      path.includes("stream.aspx") ||
      path.includes("/recording") ||
      title.includes("meeting transcript")
    );
  }

  function createCustomToolbarButton() {
    const item = document.createElement("div");
    item.className = "ms-OverflowSet-item item-71";
    item.id = "teams-transcript-custom-download-item";
    item.setAttribute("role", "none");

    const button = document.createElement("button");
    button.type = "button";
    button.role = "button";
    button.id = "teams-transcript-custom-download";
    button.className = "ms-Button ms-Button--commandBar ms-CommandBarItem-link";
    button.setAttribute("aria-label", "Download .txt transcript");
    button.setAttribute("aria-disabled", "false");
    button.setAttribute("tabindex", "0");
    button.style.cursor = "pointer";

    const flex = document.createElement("span");
    flex.className = "ms-Button-flexContainer flexContainer-74";

    const icon = document.createElement("i");
    icon.setAttribute("data-icon-name", "Download");
    icon.setAttribute("aria-hidden", "true");
    icon.className = "ms-Icon root-32 css-81 ms-Button-icon icon-343";
    icon.style.fontFamily = "FabricMDL2Icons";
    icon.textContent = "";

    const textWrap = document.createElement("span");
    textWrap.className = "ms-Button-textContainer textContainer-75";
    const label = document.createElement("span");
    label.className = "ms-Button-label";
    label.textContent = "Download .txt transcript";
    textWrap.appendChild(label);

    flex.appendChild(icon);
    flex.appendChild(textWrap);
    button.appendChild(flex);
    item.appendChild(button);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runPageDownload().catch((err) => showToast(err?.message || String(err), true));
    });

    return item;
  }

  function attachCustomToolbarButton() {
    const inject = () => {
      if (document.getElementById("teams-transcript-custom-download-item")) return;

      const nativeButton = document.getElementById("downloadTranscript");
      if (!nativeButton) return;

      const nativeItem = nativeButton.closest(".ms-OverflowSet-item");
      if (!nativeItem || !nativeItem.parentElement) return;

      const customItem = createCustomToolbarButton();
      nativeItem.insertAdjacentElement("afterend", customItem);
    };

    inject();
    const observer = new MutationObserver(() => inject());
    observer.observe(document.documentElement, { childList: true, subtree: true });
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
  if (shouldAttachToolbarButton()) {
    attachCustomToolbarButton();
  }
})();
