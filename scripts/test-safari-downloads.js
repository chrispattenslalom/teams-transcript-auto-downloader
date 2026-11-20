import assert from "node:assert/strict";
import { downloadTranscript } from "../extension/src/background/downloads.js";

const originalChrome = globalThis.chrome;
const payload = {
  meetingTitle: "Safari fixture",
  scheduledStart: "20260102_030405",
  data: { entries: [{ speakerDisplayName: "Alex", startOffset: "00:00:01.000", text: "First entry" }] }
};

try {
  let request;
  globalThis.chrome = {
    runtime: {
      sendNativeMessage: async (application, message) => {
        request = { application, message };
        return { ok: true, filename: "saved (1).txt" };
      }
    }
  };

  const saved = await downloadTranscript(payload);
  assert.deepEqual(saved, { ok: true, filename: "saved (1).txt" });
  assert.equal(request.application, "application.id");
  assert.equal(request.message.type, "SAVE_TRANSCRIPT");
  assert.equal(request.message.filename, "2026-01-02 0304 - Safari fixture.txt");
  assert.match(request.message.text, /Alex\n00:00:01\nFirst entry/);

  chrome.runtime.sendNativeMessage = async () => ({ ok: false, error: "Downloads access denied" });
  const denied = await downloadTranscript(payload);
  assert.equal(denied.ok, false);
  assert.equal(denied.errorMessage, "Downloads access denied");

  chrome.runtime.sendNativeMessage = async () => ({ ok: true });
  assert.equal((await downloadTranscript(payload)).ok, false);

  chrome.runtime.sendNativeMessage = async () => { throw new Error("Native host unavailable"); };
  assert.equal((await downloadTranscript(payload)).errorMessage, "Native host unavailable");
} finally {
  if (originalChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = originalChrome;
}
