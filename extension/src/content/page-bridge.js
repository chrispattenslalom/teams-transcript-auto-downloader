(function () {
  "use strict";

  const TO_BRIDGE = "teams-transcript-content";
  const FROM_BRIDGE = "teams-transcript-bridge";

  function pickTranscript(list) {
    const transcripts = list?.value || list || [];
    if (!transcripts.length) return null;

    let selected = transcripts.find((t) => t.isDefault && t.isVisible);
    if (!selected) selected = transcripts.find((t) => t.isVisible);
    if (!selected) selected = transcripts[0];
    return selected;
  }

  function parseMeetingMeta(title) {
    const text = String(title || "");
    const scheduledMatch = text.match(/(\d{8}_\d{6})/);
    let meetingTitle = text
      .replace(/-\d{8}_\d{6}-.*/i, "")
      .replace(/-Meeting Transcript\.mp4$/i, "")
      .trim();
    if (!meetingTitle) meetingTitle = "Meeting Transcript";
    return {
      meetingTitle,
      scheduledStart: scheduledMatch ? scheduledMatch[1] : ""
    };
  }

  function resolveGlobals(urlOverride) {
    const g = window.g_fileInfo || {};
    const raw =
      g[".spItemUrl"] ||
      g.spItemUrl ||
      g[".itemUrl"] ||
      g.itemUrl ||
      urlOverride ||
      window.location.href;

    if (!raw) throw new Error("spItemUrl not found");

    const u = new URL(raw);
    u.search = "";

    const token =
      g[".hostAccessToken"] ||
      (window._spPageContextInfo && window._spPageContextInfo.authToken) ||
      "";

    return {
      baseUrl: `${u.origin}${u.pathname}`,
      token,
      playbackToken: g.playbackToken || "",
      title: document.title || "Meeting Transcript"
    };
  }

  async function fetchJson(url, token) {
    const headers = token
      ? {
          Authorization: `Bearer ${token}`,
          "X-Authorization": `Bearer ${token}`
        }
      : {};

    const response = await fetch(url, {
      headers,
      credentials: "include"
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("auth-required");
      }
      throw new Error(`fetch-failed:${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error("parse-failed");
    }
  }

  function mapErrorCode(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (msg.includes("auth-required")) return "auth-required";
    if (msg.includes("network")) return "network-failure";
    if (msg.includes("parse-failed")) return "parse-failed";
    if (msg.includes("fetch-failed")) return "fetch-failed";
    return "fetch-failed";
  }

  async function extractTranscript(urlOverride) {
    const globals = resolveGlobals(urlOverride);
    const listUrl = `${globals.baseUrl}/media/transcripts`;
    const transcriptList = await fetchJson(listUrl, globals.token);
    const transcript = pickTranscript(transcriptList);

    if (!transcript) {
      return { type: "TRANSCRIPT_NOT_FOUND", reason: "no-transcript" };
    }

    let streamUrl;
    if (transcript.temporaryDownloadUrl) {
      const u = new URL(transcript.temporaryDownloadUrl);
      u.searchParams.delete("is");
      u.searchParams.set("$format", "json");
      streamUrl = u.toString();
    } else {
      const u = new URL(`${globals.baseUrl}/media/transcripts/${transcript.id}/streamContent`);
      u.searchParams.set("$format", "json");
      if (globals.playbackToken) u.searchParams.set("playbackToken", globals.playbackToken);
      streamUrl = u.toString();
    }

    const data = await fetchJson(streamUrl, globals.token);
    const meta = parseMeetingMeta(globals.title);

    return {
      type: "TRANSCRIPT_FOUND",
      url: urlOverride || window.location.href,
      transcriptId: transcript.id,
      meetingTitle: meta.meetingTitle,
      scheduledStart: meta.scheduledStart,
      data
    };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.source !== TO_BRIDGE) return;

    const { requestId, url } = event.data;

    try {
      const result = await extractTranscript(url);
      window.postMessage({ source: FROM_BRIDGE, requestId, payload: result }, "*");
    } catch (err) {
      window.postMessage(
        {
          source: FROM_BRIDGE,
          requestId,
          payload: {
            type: "TRANSCRIPT_ERROR",
            reason: mapErrorCode(err),
            detail: err?.message || String(err)
          }
        },
        "*"
      );
    }
  });
})();
