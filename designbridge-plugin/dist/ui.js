"use strict";
(() => {
  // src/ui.ts
  var exportBtn = document.getElementById("export-btn");
  var statusEl = document.getElementById("status");
  var previewEl = document.getElementById("preview");
  var downloadSection = document.getElementById("download-section");
  var downloadTokensBtn = document.getElementById("download-tokens");
  var downloadComponentsBtn = document.getElementById("download-components");
  var statsEl = document.getElementById("diff-stats");
  var fileKeyInput = document.getElementById("file-key-input");
  var lastPayload = null;
  function setStatus(msg, type = "idle") {
    statusEl.textContent = msg;
    statusEl.className = `status status--${type}`;
  }
  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function countLeafTokens(obj, depth = 0) {
    if (depth > 10)
      return 0;
    let count = 0;
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object" && "$type" in val) {
        count++;
      } else if (val && typeof val === "object") {
        count += countLeafTokens(val, depth + 1);
      }
    }
    return count;
  }
  function renderStats(payload) {
    const { stats } = payload;
    const total = payload.components.components.length;
    const tokenCount = countLeafTokens(payload.tokens);
    statsEl.innerHTML = [
      `<span class="stat stat--total">${total} components</span>`,
      stats.new > 0 ? `<span class="stat stat--new">${stats.new} new</span>` : "",
      stats.modified > 0 ? `<span class="stat stat--modified">${stats.modified} modified</span>` : "",
      stats.synced > 0 ? `<span class="stat stat--synced">${stats.synced} synced</span>` : "",
      tokenCount > 0 ? `<span class="stat stat--tokens">${tokenCount} tokens</span>` : ""
    ].filter(Boolean).join("");
    statsEl.style.display = "flex";
  }
  function renderPreview(payload) {
    const excerpt = JSON.stringify(payload.tokens, null, 2);
    previewEl.textContent = excerpt.length > 2 ? excerpt.slice(0, 600) + (excerpt.length > 600 ? "\n  \u2026" : "") : "(no tokens \u2014 add Local Styles or Variables in Figma)";
  }
  exportBtn.addEventListener("click", () => {
    exportBtn.disabled = true;
    downloadSection.style.display = "none";
    statsEl.style.display = "none";
    statsEl.innerHTML = "";
    previewEl.textContent = "";
    setStatus("Exporting\u2026", "loading");
    parent.postMessage({ pluginMessage: { type: "EXPORT", fileKey: fileKeyInput.value.trim() } }, "*");
  });
  downloadTokensBtn.addEventListener("click", () => {
    if (lastPayload)
      downloadJSON("tokens.json", lastPayload.tokens);
  });
  downloadComponentsBtn.addEventListener("click", () => {
    if (lastPayload)
      downloadJSON("components.manifest.json", lastPayload.components);
  });
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg)
      return;
    if (msg.type === "STATUS") {
      setStatus(msg.message, "loading");
      return;
    }
    if (msg.type === "FILE_KEY") {
      const val = msg.value;
      if (val && !fileKeyInput.value)
        fileKeyInput.value = val;
      return;
    }
    if (msg.type === "EXPORT_READY") {
      lastPayload = msg.payload;
      setStatus("Export ready", "success");
      renderStats(msg.payload);
      renderPreview(msg.payload);
      downloadSection.style.display = "flex";
      exportBtn.disabled = false;
      return;
    }
    if (msg.type === "ERROR") {
      setStatus(`Error: ${msg.message}`, "error");
      exportBtn.disabled = false;
    }
  };
})();
