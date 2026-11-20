(function () {
  "use strict";

  if (window === window.top) return;

  const config = new URL(window.location.href).searchParams.get("xplatConfig");
  if (!config) return;

  let context;
  try {
    context = JSON.parse(config);
  } catch {
    return;
  }
  if (context?.ha !== "Teams" || context?.hv !== "Recap") return;

  const recordingId = new URL(window.location.href).searchParams.get("uniqueId") || "";
  let transcriptResource = null;

  function transcriptPayload(data, transcriptId) {
    const sourceId = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(recordingId)
      ? recordingId
      : transcriptId;
    return {
      type: "TRANSCRIPT_FOUND",
      transcriptId,
      sourceId,
      meetingTitle: "Meeting Transcript",
      scheduledStart: "",
      data
    };
  }

  function rememberTranscriptResource(entry) {
    if (!entry.name.startsWith(`${window.location.origin}/`)) return;
    const url = new URL(entry.name);
    const match = url.pathname.match(/\/media\/transcripts\/([^/]+)\/(content|streamContent)\/?$/i);
    if (!match) return;
    try {
      transcriptResource = { url: url.href, id: decodeURIComponent(match[1]), kind: match[2].toLowerCase() };
    } catch (err) {
      console.warn("Ignoring a transcript resource with an invalid identifier", err);
    }
  }

  performance.getEntriesByType("resource").forEach(rememberTranscriptResource);
  const resources = new PerformanceObserver((list) => {
    list.getEntries().forEach(rememberTranscriptResource);
  });
  resources.observe({ type: "resource", buffered: true });

  async function fetchTranscript() {
    if (!transcriptResource) {
      throw new Error("Open the transcript and wait for it to finish loading, then try again.");
    }

    const { id, kind } = transcriptResource;
    const url = new URL(transcriptResource.url);
    url.searchParams.set(kind === "streamcontent" ? "$format" : "format", "json");
    const response = await fetch(url.href, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Could not load the transcript (HTTP ${response.status}).`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The transcript response is not valid JSON.");
    }
    const entries = Array.isArray(data) ? data : data?.entries;
    if (!Array.isArray(entries) || !entries.some((entry) => typeof entry?.text === "string" && entry.text.trim())) {
      throw new Error("No transcript entries were found.");
    }

    return transcriptPayload(data, id);
  }

  function findScrollContainer(entry) {
    let element = entry.parentElement;
    while (element && element !== document.body) {
      const overflow = getComputedStyle(element).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  async function collectTranscript() {
    const panel = document.getElementById("OneTranscript");
    const selector = 'div[id^="sub-entry-"][role="listitem"]';
    const first = panel?.querySelector(selector);
    const total = Number(first?.getAttribute("aria-setsize"));
    if (!first || !Number.isSafeInteger(total) || total < 1) {
      throw new Error("Cannot verify the complete transcript from the displayed entries.");
    }

    const collected = new Map();
    const container = findScrollContainer(first);
    const originalPosition = container?.scrollTop;
    const deadline = Date.now() + 120000;

    function collectVisible() {
      if (!panel.isConnected) throw new Error("The transcript changed while it was being collected.");
      for (const entry of panel.querySelectorAll(selector)) {
        const position = Number(entry.getAttribute("aria-posinset"));
        const size = Number(entry.getAttribute("aria-setsize"));
        if (!Number.isSafeInteger(position) || position < 1 || position > total || size !== total) {
          throw new Error("Cannot verify the complete transcript from the displayed entries.");
        }

        const group = entry.closest('[id^="listItem-"]') || entry.closest('[id^="entry-"]') || entry;
        const speaker = group.querySelector('[class*="itemDisplayName"], [class*="eventSpeakerName"]');
        const timestamp = group.querySelector('[id^="Header-timestamp-"]');
        const text = entry.querySelector('[class*="entryText"]') || entry;
        const content = (text.innerText || "").trim();
        if (!content) continue;
        collected.set(position, {
          groupId: group.id || "",
          speakerDisplayName: (speaker?.textContent || "").trim(),
          startOffset: (timestamp?.textContent || "").trim(),
          text: content
        });
      }
    }

    try {
      if (container) {
        container.scrollTop = 0;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      while (true) {
        collectVisible();
        if (collected.size === total) break;
        if (!container || Date.now() > deadline) {
          throw new Error("Could not collect the complete transcript.");
        }

        const bottom = container.scrollHeight - container.clientHeight;
        if (container.scrollTop >= bottom - 1) {
          throw new Error("Could not collect the complete transcript.");
        }

        const previous = container.scrollTop;
        container.scrollTop = Math.min(bottom, previous + Math.max(50, container.clientHeight / 2));
        if (container.scrollTop <= previous) {
          throw new Error("Could not scroll through the complete transcript.");
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } finally {
      if (container) container.scrollTop = originalPosition;
    }

    let previousSpeaker = "";
    let previousGroup = "";
    const entries = [...collected.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, entry]) => {
        if (entry.speakerDisplayName) previousSpeaker = entry.speakerDisplayName;
        else if (entry.groupId && entry.groupId === previousGroup) entry.speakerDisplayName = previousSpeaker;
        else previousSpeaker = "";
        previousGroup = entry.groupId;
        delete entry.groupId;
        return entry;
      });

    return transcriptPayload({ entries }, transcriptResource?.id || "");
  }

  async function extractTranscript() {
    try {
      return await fetchTranscript();
    } catch (err) {
      console.warn("Could not retrieve transcript data; collecting displayed entries instead.", err);
      try {
        return await collectTranscript();
      } catch (collectError) {
        throw new Error(`${err?.message || String(err)} ${collectError?.message || String(collectError)}`);
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "START_EXTRACT") return;

    extractTranscript()
      .then(sendResponse)
      .catch((err) => {
        console.error("Teams transcript extraction failed", err);
        sendResponse({
          type: "TRANSCRIPT_ERROR",
          reason: "fetch-failed",
          detail: err?.message || String(err)
        });
      });
    return true;
  });

  function createDownloadControl() {
    const control = document.createElement("div");
    control.id = "teams-transcript-recap-control";
    control.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";

    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.hidden = true;
    status.style.cssText = "max-width:320px;padding:8px 10px;border-radius:6px;color:#fff";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Download .txt transcript";
    button.style.cssText = "padding:8px 12px;border:0;border-radius:6px;background:#6264a7;color:#fff;cursor:pointer;font:inherit";

    let statusTimer;
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Downloading transcript...";
      status.hidden = true;
      clearTimeout(statusTimer);
      try {
        const result = await chrome.runtime.sendMessage({
          type: "PAGE_DOWNLOAD_REQUEST",
          url: `${window.location.origin}${window.location.pathname}`
        });
        if (!result?.ok) throw new Error(result?.reason || "Transcript download failed.");
        status.textContent = "Transcript downloaded";
        status.style.background = "#14532d";
      } catch (err) {
        status.textContent = err?.message || String(err);
        status.style.background = "#8b1e1e";
      } finally {
        status.hidden = false;
        statusTimer = setTimeout(() => { status.hidden = true; }, 5000);
        button.textContent = "Download .txt transcript";
        button.disabled = false;
      }
    });

    control.append(status, button);
    return control;
  }

  function observeTranscriptPanel() {
    let control;
    let scheduled = false;

    function updateControl() {
      scheduled = false;
      const panel = document.getElementById("OneTranscript");
      const visible = panel && panel.getClientRects().length > 0;
      if (visible && (!control || !control.isConnected)) {
        control = createDownloadControl();
        document.body.appendChild(control);
      } else if (!visible && control) {
        control.remove();
        control = null;
      }
    }

    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(updateControl);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });
    updateControl();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeTranscriptPanel, { once: true });
  } else {
    observeTranscriptPanel();
  }
})();
