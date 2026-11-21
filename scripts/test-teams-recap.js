import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../extension/src/content/teams-recap.js", import.meta.url), "utf8");
const origin = "https://tenant.sharepoint.com";
const contentUrl = `${origin}/_api/v2.1/drives/a/items/b/media/transcripts/transcript-1/content?format=vtt`;
const transcript = {
  entries: [
    { speakerDisplayName: "Alex", startOffset: "00:00:01.000", text: "First entry" },
    { speakerDisplayName: "Sam", startOffset: "00:00:02.000", text: "Last entry" }
  ]
};

function createFrame({
  config = { ha: "Teams", hv: "Recap" },
  status = 200,
  topLevel = false,
  virtualPanel,
  uniqueId
} = {}) {
  let listener;
  let observeResources;
  const requests = [];
  const location = new URL(`${origin}/personal/user/_layouts/15/xplatplugins.aspx`);
  location.searchParams.set("xplatConfig", JSON.stringify(config));
  if (uniqueId) location.searchParams.set("uniqueId", uniqueId);
  const window = { location };
  window.top = topLevel ? window : {};

  const context = {
    window,
    URL,
    performance: { getEntriesByType: () => [] },
    PerformanceObserver: class {
      constructor(callback) {
        observeResources = (entries) => callback({ getEntries: () => entries });
      }
      observe() {}
    },
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById: () => virtualPanel?.panel || null,
      body: virtualPanel?.body
    },
    getComputedStyle: () => ({ overflowY: "auto" }),
    chrome: { runtime: { onMessage: { addListener: (handler) => { listener = handler; } } } },
    console: { warn() {}, error() {} },
    setTimeout: (callback) => queueMicrotask(callback),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: status === 200, status, json: async () => transcript };
    }
  };
  runInNewContext(source, context);

  return {
    requests,
    isListening: () => Boolean(listener),
    resource: (url) => observeResources([{ name: url }]),
    extract: () => new Promise((resolve) => {
      assert.equal(listener({ type: "START_EXTRACT" }, {}, resolve), true);
    })
  };
}

function createVirtualPanel(actualTotal, reportedTotal = actualTotal, emptyPosition = 0, missingSpeakers = []) {
  const body = {};
  let scrollTop = 100;
  const container = {
    parentElement: body,
    clientHeight: 100,
    scrollHeight: actualTotal * 100,
    get scrollTop() { return scrollTop; },
    set scrollTop(value) { scrollTop = value; }
  };

  function visibleEntries() {
    const first = Math.floor(scrollTop / 100);
    return Array.from({ length: Math.min(2, actualTotal - first) }, (_, index) => {
      const position = first + index + 1;
      const group = {
        id: missingSpeakers.includes(position) ? "listItem-missing" : `listItem-${position}`,
        querySelector: (selector) => selector.includes("itemDisplayName")
          ? (missingSpeakers.includes(position) ? null : { textContent: "Speaker" })
          : { textContent: `0:0${position}` }
      };
      return {
        parentElement: container,
        getAttribute: (name) => String(name === "aria-setsize" ? reportedTotal : position),
        closest: () => group,
        querySelector: () => ({ innerText: position === emptyPosition ? "" : `Entry ${position}` })
      };
    });
  }

  return {
    body,
    container,
    panel: {
      isConnected: true,
      querySelector: () => visibleEntries()[0],
      querySelectorAll: visibleEntries
    }
  };
}

const frame = createFrame({ uniqueId: "11111111-2222-3333-4444-555555555555" });
frame.resource("https://other.sharepoint.com/media/transcripts/wrong/content?format=json");
frame.resource(`${origin}/media/transcripts/%E0%A4%A/content`);
frame.resource(contentUrl);
const result = await frame.extract();
assert.equal(result.type, "TRANSCRIPT_FOUND");
assert.equal(result.transcriptId, "transcript-1");
assert.equal(result.sourceId, "11111111-2222-3333-4444-555555555555");
assert.equal(result.data, transcript);
assert.equal(frame.requests.length, 1);
assert.equal(new URL(frame.requests[0].url).searchParams.get("format"), "json");
assert.equal(frame.requests[0].options.credentials, "include");

const foreignFrame = createFrame();
foreignFrame.resource("https://other.sharepoint.com/media/transcripts/wrong/content");
const unavailable = await foreignFrame.extract();
assert.equal(unavailable.type, "TRANSCRIPT_ERROR");
assert.match(unavailable.detail, /Cannot verify the complete transcript/);
assert.equal(foreignFrame.requests.length, 0);

const deniedFrame = createFrame({ status: 403 });
deniedFrame.resource(contentUrl);
const denied = await deniedFrame.extract();
assert.equal(denied.type, "TRANSCRIPT_ERROR");
assert.match(denied.detail, /HTTP 403/);
assert.match(denied.detail, /Cannot verify the complete transcript/);

const virtualPanel = createVirtualPanel(5);
const fallbackFrame = createFrame({ status: 403, virtualPanel });
fallbackFrame.resource(contentUrl);
const fallback = await fallbackFrame.extract();
assert.equal(fallback.type, "TRANSCRIPT_FOUND");
assert.deepEqual(Array.from(fallback.data.entries, (entry) => entry.text), [
  "Entry 1", "Entry 2", "Entry 3", "Entry 4", "Entry 5"
]);
assert.equal(fallback.data.entries[0].speakerDisplayName, "Speaker");
assert.equal(fallback.data.entries[0].startOffset, "0:01");
assert.equal(virtualPanel.container.scrollTop, 100);

const missingSpeakerPanel = createVirtualPanel(5, 5, 0, [3, 4]);
const missingSpeakerFrame = createFrame({ status: 403, virtualPanel: missingSpeakerPanel });
missingSpeakerFrame.resource(contentUrl);
const missingSpeaker = await missingSpeakerFrame.extract();
assert.equal(missingSpeaker.data.entries[2].speakerDisplayName, "");
assert.equal(missingSpeaker.data.entries[3].speakerDisplayName, "");

const incompletePanel = createVirtualPanel(5, 6);
const incompleteFrame = createFrame({ status: 403, virtualPanel: incompletePanel });
incompleteFrame.resource(contentUrl);
const incomplete = await incompleteFrame.extract();
assert.equal(incomplete.type, "TRANSCRIPT_ERROR");
assert.match(incomplete.detail, /Could not collect the complete transcript/);
assert.equal(incompletePanel.container.scrollTop, 100);

const emptyPanel = createVirtualPanel(5, 5, 3);
const emptyFrame = createFrame({ status: 403, virtualPanel: emptyPanel });
emptyFrame.resource(contentUrl);
assert.match((await emptyFrame.extract()).detail, /Could not collect the complete transcript/);
assert.equal(emptyPanel.container.scrollTop, 100);
assert.equal(createFrame({ config: null }).isListening(), false);
assert.equal(createFrame({ config: { ha: "Other", hv: "Recap" } }).isListening(), false);
assert.equal(createFrame({ topLevel: true }).isListening(), false);

let handleMessage;
let handleAction;
let extraction = result;
let downloadOptions;
const messages = [];
const storage = {};
const originalChrome = globalThis.chrome;
globalThis.chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener: (handler) => { handleMessage = handler; } }
  },
  action: { onClicked: { addListener: (handler) => { handleAction = handler; } } },
  tabs: {
    sendMessage: async (tabId, message, options) => {
      messages.push({ tabId, type: message.type, frameId: options?.frameId ?? null });
      if (message.type === "GET_TEAMS_MEETING_INFO") return { meetingTitle: "Synthetic meeting" };
      return { ...extraction };
    }
  },
  downloads: {
    download: async (options) => { downloadOptions = options; return 42; },
    onChanged: {
      addListener: (handler) => queueMicrotask(() => handler({ id: 42, state: { current: "complete" } })),
      removeListener() {}
    }
  },
  storage: {
    local: {
      get: async () => storage,
      set: async (value) => Object.assign(storage, value)
    }
  }
};

try {
  await import("../extension/src/background/service-worker.js");

  async function requestDownload(url, frameId) {
    return new Promise((resolve) => {
      assert.equal(handleMessage(
        { type: "PAGE_DOWNLOAD_REQUEST" },
        { tab: { id: 7, url }, frameId },
        resolve
      ), true);
    });
  }

  const teamsResult = await requestDownload("https://teams.microsoft.com/v2/#/meeting", 12);
  assert.equal(teamsResult.ok, true);
  assert.deepEqual(messages.map(({ type, frameId }) => [type, frameId]), [
    ["START_EXTRACT", 12],
    ["GET_TEAMS_MEETING_INFO", 0]
  ]);
  assert.match(downloadOptions.filename, /Synthetic meeting\.txt$/);
  const downloadedText = decodeURIComponent(downloadOptions.url.split(",")[1]);
  assert.match(downloadedText, /First entry/);
  assert.match(downloadedText, /Last entry/);
  assert.doesNotMatch(JSON.stringify(storage), /First entry|Last entry/);

  const firstHistoryCount = Object.keys(storage.history).length;
  extraction = { ...result, transcriptId: "transcript-2", sourceId: "different-meeting" };
  const secondTeamsResult = await requestDownload("https://teams.microsoft.com/v2/#/meeting", 12);
  assert.equal(secondTeamsResult.ok, true);
  assert.equal(Object.keys(storage.history).length, firstHistoryCount + 2);

  messages.length = 0;
  extraction = { ...result, sourceId: undefined };
  const sharePointResult = await requestDownload("https://tenant.sharepoint.com/recording", 0);
  assert.equal(sharePointResult.ok, true);
  assert.deepEqual(messages.map(({ type, frameId }) => [type, frameId]), [["START_EXTRACT", 0]]);

  messages.length = 0;
  await handleAction({ id: 7, url: "https://tenant.sharepoint.com/recording" });
  assert.deepEqual(messages.map(({ type, frameId }) => [type, frameId]), [["START_EXTRACT", null]]);

  extraction = { type: "TRANSCRIPT_ERROR", reason: "fetch-failed", detail: "HTTP 403" };
  const failed = await requestDownload("https://teams.microsoft.com/v2/#/meeting", 12);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "HTTP 403");
} finally {
  if (originalChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = originalChrome;
}
