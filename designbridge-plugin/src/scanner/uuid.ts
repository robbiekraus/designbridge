const PLUGIN_DATA_KEY = 'designbridge_uuid';

// Figma sandbox has no crypto.getRandomValues — use Math.random-based v4
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a persistent UUID for a node.
 * Assigned once, never overwritten.
 */
export function getOrCreateUUID(node: BaseNode): string {
  const existing = node.getPluginData(PLUGIN_DATA_KEY);
  if (existing) return existing;

  const fresh = uuidv4();
  node.setPluginData(PLUGIN_DATA_KEY, fresh);
  return fresh;
}
