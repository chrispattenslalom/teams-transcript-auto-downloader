export const SETTINGS_KEY = "settings";
export const QUEUE_KEY = "queue";
export const HISTORY_KEY = "history";

export const DEFAULT_SETTINGS = {
  enabled: true,
  closeTab: true,
  throttleMs: 2000,
  lookbackDays: 1,
  allowRedownload: false
};

export const ERROR_CODES = {
  AUTH_REQUIRED: "auth-required",
  NO_TRANSCRIPT: "no-transcript",
  NETWORK_FAILURE: "network-failure",
  FETCH_FAILED: "fetch-failed",
  PARSE_FAILED: "parse-failed",
  DOWNLOAD_FAILED: "download-failed",
  TIMEOUT: "timeout",
  UNKNOWN: "unknown"
};

export const MESSAGE_TYPES = {
  ADD_URLS: "ADD_URLS",
  GET_STATUS: "GET_STATUS",
  RUN_QUEUE: "RUN_QUEUE",
  RETRY_ITEM: "RETRY_ITEM",
  START_EXTRACT: "START_EXTRACT",
  PAGE_DOWNLOAD_REQUEST: "PAGE_DOWNLOAD_REQUEST",
  TRANSCRIPT_FOUND: "TRANSCRIPT_FOUND",
  TRANSCRIPT_NOT_FOUND: "TRANSCRIPT_NOT_FOUND",
  TRANSCRIPT_ERROR: "TRANSCRIPT_ERROR"
};

export const QUEUE_LIMIT_PER_RUN = 200;
export const MAX_ATTEMPTS = 2;
export const ITEM_TIMEOUT_MS = 45000;
export const BACKOFF_MS = 5000;
