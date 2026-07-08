import type { SandboxMessage, ExportReadyPayload } from './types/manifest';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const previewEl = document.getElementById('preview') as HTMLPreElement;
const downloadSection = document.getElementById('download-section') as HTMLDivElement;
const downloadTokensBtn = document.getElementById('download-tokens') as HTMLButtonElement;
const downloadComponentsBtn = document.getElementById('download-components') as HTMLButtonElement;
const statsEl = document.getElementById('diff-stats') as HTMLDivElement;
const fileKeyInput = document.getElementById('file-key-input') as HTMLInputElement;
const importJson = document.getElementById('import-json') as HTMLTextAreaElement;
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const importFetchBtn = document.getElementById('import-fetch-btn') as HTMLButtonElement;
const importStatus = document.getElementById('import-status') as HTMLParagraphElement;

const DESIGNBRIDGE_URL = 'http://localhost:3047/api/figma-export/latest';

// ─── State ────────────────────────────────────────────────────────────────────

let lastPayload: ExportReadyPayload | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg: string, type: 'idle' | 'loading' | 'success' | 'error' = 'idle'): void {
  statusEl.textContent = msg;
  statusEl.className = `status status--${type}`;
}

function setImportStatus(msg: string, type: 'idle' | 'loading' | 'success' | 'error' = 'idle'): void {
  importStatus.textContent = msg;
  importStatus.className = `status status--${type}`;
}

function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function countLeafTokens(obj: Record<string, unknown>, depth = 0): number {
  if (depth > 10) return 0;
  let count = 0;
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && '$type' in (val as object)) {
      count++;
    } else if (val && typeof val === 'object') {
      count += countLeafTokens(val as Record<string, unknown>, depth + 1);
    }
  }
  return count;
}

function renderStats(payload: ExportReadyPayload): void {
  const { stats } = payload;
  const total = payload.components.components.length;
  const tokenCount = countLeafTokens(payload.tokens as Record<string, unknown>);

  statsEl.innerHTML = [
    `<span class="stat stat--total">${total} components</span>`,
    stats.new > 0 ? `<span class="stat stat--new">${stats.new} new</span>` : '',
    stats.modified > 0 ? `<span class="stat stat--modified">${stats.modified} modified</span>` : '',
    stats.synced > 0 ? `<span class="stat stat--synced">${stats.synced} synced</span>` : '',
    tokenCount > 0 ? `<span class="stat stat--tokens">${tokenCount} tokens</span>` : '',
  ]
    .filter(Boolean)
    .join('');
  statsEl.style.display = 'flex';
}

function renderPreview(payload: ExportReadyPayload): void {
  const excerpt = JSON.stringify(payload.tokens, null, 2);
  previewEl.textContent =
    excerpt.length > 2
      ? excerpt.slice(0, 600) + (excerpt.length > 600 ? '\n  …' : '')
      : '(no tokens — add Local Styles or Variables in Figma)';
}

// ─── Event handlers ───────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  exportBtn.disabled = true;
  downloadSection.style.display = 'none';
  statsEl.style.display = 'none';
  statsEl.innerHTML = '';
  previewEl.textContent = '';
  setStatus('Exporting…', 'loading');
  parent.postMessage({ pluginMessage: { type: 'EXPORT', fileKey: fileKeyInput.value.trim() } }, '*');
});

importBtn.addEventListener('click', () => {
  const json = importJson.value.trim();
  if (!json) {
    setImportStatus('Bitte zuerst den DesignBridge-Export einfügen.', 'error');
    return;
  }
  importBtn.disabled = true;
  setImportStatus('Schreibe nach Figma…', 'loading');
  parent.postMessage({ pluginMessage: { type: 'IMPORT', json } }, '*');
});

importFetchBtn.addEventListener('click', async () => {
  importFetchBtn.disabled = true;
  setImportStatus('Hole Export aus DesignBridge…', 'loading');
  try {
    const res = await fetch(DESIGNBRIDGE_URL);
    if (!res.ok) {
      const msg =
        res.status === 404
          ? 'Noch kein Export — in DesignBridge zuerst „An Figma senden" klicken.'
          : `DesignBridge-Server antwortete mit ${res.status}.`;
      setImportStatus(msg, 'error');
      importFetchBtn.disabled = false;
      return;
    }
    const data = await res.json();
    const json = JSON.stringify(data);
    importJson.value = json;
    setImportStatus('Schreibe nach Figma…', 'loading');
    parent.postMessage({ pluginMessage: { type: 'IMPORT', json } }, '*');
  } catch {
    setImportStatus('DesignBridge nicht erreichbar — läuft „npm run dev"?', 'error');
    importFetchBtn.disabled = false;
  }
});

function fileSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

downloadTokensBtn.addEventListener('click', () => {
  if (!lastPayload) return;
  const slug = fileSlug(lastPayload.fileName ?? 'export');
  downloadJSON(`${slug}-tokens.json`, lastPayload.tokens);
});

downloadComponentsBtn.addEventListener('click', () => {
  if (!lastPayload) return;
  const slug = fileSlug(lastPayload.fileName ?? 'export');
  downloadJSON(`${slug}-components.manifest.json`, lastPayload.components);
});

// ─── Message handler ──────────────────────────────────────────────────────────

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as SandboxMessage;
  if (!msg) return;

  if (msg.type === 'STATUS') {
    setStatus(msg.message, 'loading');
    return;
  }

  if ((msg as unknown as { type: string; value: string }).type === 'FILE_KEY') {
    const val = (msg as unknown as { type: string; value: string }).value;
    if (val && !fileKeyInput.value) fileKeyInput.value = val;
    return;
  }

  if (msg.type === 'EXPORT_READY') {
    lastPayload = msg.payload;
    setStatus('Export ready', 'success');
    renderStats(msg.payload);
    renderPreview(msg.payload);
    downloadSection.style.display = 'flex';
    exportBtn.disabled = false;
    return;
  }

  if (msg.type === 'IMPORT_DONE') {
    const s = msg.summary;
    const parts = [
      `${s.colorsCreated} Farben neu`,
      s.colorsUpdated ? `${s.colorsUpdated} Farben aktualisiert` : '',
      `${s.textCreated} Textstile neu`,
      s.textUpdated ? `${s.textUpdated} Textstile aktualisiert` : '',
      s.componentsCreated ? `${s.componentsCreated} Komponenten neu` : '',
      s.componentsUpdated ? `${s.componentsUpdated} Komponenten aktualisiert` : '',
      s.placeholders ? `${s.placeholders} Platzhalter` : '',
    ].filter(Boolean);
    const skipped = s.skipped.length ? ` · ${s.skipped.length} übersprungen` : '';
    setImportStatus(`Fertig — ${parts.join(', ')}${skipped}.`, 'success');
    importBtn.disabled = false;
    importFetchBtn.disabled = false;
    return;
  }

  if (msg.type === 'ERROR') {
    setStatus(`Error: ${msg.message}`, 'error');
    setImportStatus(`Fehler: ${msg.message}`, 'error');
    exportBtn.disabled = false;
    importBtn.disabled = false;
    importFetchBtn.disabled = false;
  }
};
