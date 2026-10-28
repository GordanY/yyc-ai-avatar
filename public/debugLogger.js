if (typeof window !== "undefined" && !window.error_handler_installed) {
  const originalConsole = window.console;
  const levels = new Set(["log", "debug", "info", "warn", "error"]);
  // Capture methods before dev tools replace console properties. Looking them
  // up again while recording can call our wrapper recursively.
  const output = Object.fromEntries(Array.from(levels, level => [level, originalConsole[level].bind(originalConsole)]));
  const logs = window.error_handler_logs = [];
  let recording = false;
  let uploadPending = false;
  let retryAfter = 0;

  function record(level, args) {
    if (recording) return;
    recording = true;
    try {
      output[level](...args);
    } finally {
      recording = false;
    }
    try {
      const entry = { type: level, ts: Date.now(), arguments: Array.from(args) };
      logs.push(entry);
      if (logs.length > 200) logs.shift();
      if (uploadPending || Date.now() < retryAfter ||
          window.location.hostname !== "localhost" ||
          localStorage.getItem("chatvrm_external_api_enabled") !== "true") return;
      const body = JSON.stringify(entry);
      uploadPending = true;
      // A failed log upload must never create another logged rejection.
      Promise.resolve(fetch("/api/dataHandler/?type=logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })).then(response => {
        if (!response.ok) retryAfter = Date.now() + 30000;
      }).catch(() => {
        retryAfter = Date.now() + 30000;
      }).finally(() => { uploadPending = false; });
    } catch {
      uploadPending = false;
      retryAfter = Date.now() + 30000;
    }
  }

  // Keep the console object intact so framework instrumentation can wrap it.
  for (const level of levels) {
    originalConsole[level] = (...args) => record(level, args);
  }
  window.addEventListener("error", event => {
    record("error", [event.error?.stack || event.message || "Unknown browser error"]);
  });
  window.addEventListener("unhandledrejection", event => {
    record("error", ["Unhandled rejection:", event.reason?.stack || event.reason?.message || String(event.reason)]);
  });
  window.error_handler_installed = true;
}
