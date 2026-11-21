(function () {
  "use strict";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "GET_TEAMS_MEETING_INFO") return;

    const title = document.querySelector(
      '[data-tid="chat-title"] span[title], [data-tid="entity-header"] span[dir="auto"], [data-tid="chat-title"] span'
    );
    sendResponse({ meetingTitle: (title?.getAttribute("title") || title?.textContent || "").trim() });
  });
})();
