import { scanTokens } from './scanner/tokens';
import { scanComponents } from './scanner/components';
import { applyDiff } from './scanner/diff';
import type {
  UIMessage,
  SandboxMessage,
  ComponentsManifest,
  ComponentEntry,
} from './types/manifest';

const SHARED_NS = 'designbridge';
const SHARED_KEY_MANIFEST = 'manifest';
const SHARED_KEY_FILEKEY = 'fileKey';

figma.showUI(__html__, { width: 420, height: 600, themeColors: true });

// Send cached file key to UI on open so the input is pre-filled
const cachedKey = figma.fileKey ?? figma.root.getSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY);
if (cachedKey) {
  figma.ui.postMessage({ type: 'FILE_KEY', value: cachedKey } as unknown as SandboxMessage);
}

function extractKey(raw: string): string {
  // Accept full Figma URLs: figma.com/design/KEY/... or figma.com/file/KEY/...
  const match = raw.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
  return match ? match[1] : raw.trim();
}

function resolveFileKey(providedKey?: string): string {
  // 1. Manual input from UI takes priority
  if (providedKey && providedKey.trim()) {
    const key = extractKey(providedKey);
    figma.root.setSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY, key);
    return key;
  }
  // 2. figma.fileKey (works in published plugins + saved files)
  if (figma.fileKey) {
    figma.root.setSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY, figma.fileKey);
    return figma.fileKey;
  }
  // 3. Cached from previous run
  const cached = figma.root.getSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY);
  return cached || '';
}

function loadPreviousManifest(): ComponentEntry[] {
  try {
    const raw = figma.root.getSharedPluginData(SHARED_NS, SHARED_KEY_MANIFEST);
    if (!raw) return [];
    const manifest: ComponentsManifest = JSON.parse(raw);
    return manifest.components ?? [];
  } catch {
    return [];
  }
}

function saveManifest(manifest: ComponentsManifest): void {
  figma.root.setSharedPluginData(SHARED_NS, SHARED_KEY_MANIFEST, JSON.stringify(manifest));
}

function postStatus(message: string): void {
  const msg: SandboxMessage = { type: 'STATUS', message };
  figma.ui.postMessage(msg);
}

figma.ui.onmessage = async (msg: UIMessage) => {
  if (msg.type !== 'EXPORT') return;

  try {
    const fileKey = resolveFileKey(msg.fileKey);
    const previousComponents = loadPreviousManifest();
    const isFirstRun = previousComponents.length === 0;

    postStatus('Scanning tokens…');
    const tokens = await scanTokens();

    postStatus('Scanning components…');
    const scanned = await scanComponents(fileKey);

    postStatus('Comparing with previous export…');
    const { components, stats } = isFirstRun
      ? { components: scanned, stats: { new: scanned.length, synced: 0, modified: 0 } }
      : applyDiff(scanned, previousComponents);

    const manifest: ComponentsManifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      components,
    };

    saveManifest(manifest);

    const response: SandboxMessage = {
      type: 'EXPORT_READY',
      payload: { tokens, components: manifest, stats },
    };

    figma.ui.postMessage(response);
  } catch (err) {
    const errorMsg: SandboxMessage = {
      type: 'ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
    figma.ui.postMessage(errorMsg);
  }
};
