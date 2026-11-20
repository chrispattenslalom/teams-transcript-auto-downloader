import { ERROR_CODES } from "../shared/constants.js";
import { buildTranscriptFilename } from "../shared/filename.js";
import { formatTranscriptText, normalizeEntries } from "../shared/transcript.js";

function toDataUrl(text) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

function waitForDownload(downloadId) {
  return new Promise((resolve, reject) => {
    const handler = (delta) => {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === "complete") {
        chrome.downloads.onChanged.removeListener(handler);
        resolve();
      } else if (delta.error?.current) {
        chrome.downloads.onChanged.removeListener(handler);
        reject(new Error(delta.error.current));
      }
    };

    chrome.downloads.onChanged.addListener(handler);
  });
}

export async function downloadTranscript(payload) {
  const entries = normalizeEntries(payload.data);
  if (!entries.length) {
    return {
      ok: false,
      errorCode: ERROR_CODES.NO_TRANSCRIPT,
      errorMessage: "No transcript entries found"
    };
  }

  const filename = buildTranscriptFilename({
    meetingTitle: payload.meetingTitle,
    scheduledStart: payload.scheduledStart
  });

  const transcriptText = formatTranscriptText({
    meetingTitle: payload.meetingTitle,
    scheduledStart: payload.scheduledStart,
    entries
  });

  try {
    if (!chrome.downloads?.download || !chrome.downloads?.onChanged) {
      const response = await chrome.runtime.sendNativeMessage("application.id", {
        type: "SAVE_TRANSCRIPT",
        filename,
        text: transcriptText
      });
      if (!response?.ok || typeof response.filename !== "string" || !response.filename) {
        throw new Error(response?.error || "Native transcript download failed");
      }
      return { ok: true, filename: response.filename };
    }

    const id = await chrome.downloads.download({
      url: toDataUrl(transcriptText),
      filename,
      conflictAction: "uniquify",
      saveAs: false
    });
    await waitForDownload(id);

    return {
      ok: true,
      filename
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: ERROR_CODES.DOWNLOAD_FAILED,
      errorMessage: err?.message || String(err)
    };
  }
}
