import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'public', 'data');

export function readJSON<T>(filename: string): T | null {
  try {
    const filePath = path.join(dataDir, filename);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export interface FlatToken {
  path: string;
  type: string;
  value: unknown;
}

function flattenGroup(obj: Record<string, unknown>, prefix = ''): FlatToken[] {
  const result: FlatToken[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && '$value' in val) {
      result.push({
        path: currentPath,
        type: (val as Record<string, string>).$type ?? 'unknown',
        value: (val as Record<string, unknown>).$value,
      });
    } else if (val && typeof val === 'object') {
      result.push(...flattenGroup(val as Record<string, unknown>, currentPath));
    }
  }
  return result;
}

export function getFlatColors(): FlatToken[] {
  const tokens = readJSON<Record<string, unknown>>('tokens.json');
  if (!tokens?.color) return [];
  return flattenGroup(tokens.color as Record<string, unknown>, 'color');
}

export function getFlatTypography(): FlatToken[] {
  const tokens = readJSON<Record<string, unknown>>('tokens.json');
  if (!tokens?.typography) return [];
  return flattenGroup(tokens.typography as Record<string, unknown>, 'typography');
}
