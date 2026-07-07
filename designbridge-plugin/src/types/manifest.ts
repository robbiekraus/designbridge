// ─── Token Types (W3C DTCG) ───────────────────────────────────────────────────

export interface ColorToken {
  $value: string;
  $type: 'color';
}

export interface DimensionToken {
  $value: string;
  $type: 'dimension';
}

export interface TypographyValue {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
}

export interface TypographyToken {
  $value: TypographyValue;
  $type: 'typography';
}

export type Token = ColorToken | DimensionToken | TypographyToken;

export interface TokenGroup {
  [key: string]: Token | TokenGroup;
}

export interface TokensFile {
  color?: TokenGroup;
  spacing?: TokenGroup;
  typography?: TokenGroup;
  [key: string]: TokenGroup | undefined;
}

// ─── Component Types ──────────────────────────────────────────────────────────

export type ComponentCategory = 'atom' | 'molecule' | 'organism' | 'template';
export type ComponentStatus = 'new' | 'synced' | 'modified';
export type PropType = 'enum' | 'boolean' | 'string' | 'number';

export interface ComponentProp {
  name: string;
  type: PropType;
  values: string[];
  default: string | boolean | number | null;
}

export interface ComponentEntry {
  uuid: string;
  name: string;
  figmaNodeId: string;
  figmaFileKey: string;
  figmaUrl: string;
  category: ComponentCategory;
  description: string;
  props: ComponentProp[];
  tokenRefs: string[];
  codeRef: string | null;
  status: ComponentStatus;
  lastSyncedAt: string;
}

export interface ComponentsManifest {
  version: string;
  exportedAt: string;
  components: ComponentEntry[];
}

// ─── Diff Stats ───────────────────────────────────────────────────────────────

export interface DiffStats {
  new: number;
  synced: number;
  modified: number;
}

// ─── Message Types (Sandbox ↔ UI) ────────────────────────────────────────────

export interface ExportMessage {
  type: 'EXPORT';
  fileKey?: string;
}

export interface ExportReadyPayload {
  tokens: TokensFile;
  components: ComponentsManifest;
  stats: DiffStats;
  fileName?: string;
}

export interface ExportReadyMessage {
  type: 'EXPORT_READY';
  payload: ExportReadyPayload;
}

export interface StatusMessage {
  type: 'STATUS';
  message: string;
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
}

// ─── Import (Code → Figma) ────────────────────────────────────────────────────

export interface ImportMessage {
  type: 'IMPORT';
  json: string;
}

export interface ImportSummary {
  colorsCreated: number;
  colorsUpdated: number;
  textCreated: number;
  textUpdated: number;
  componentsCreated: number;
  componentsUpdated: number;
  placeholders: number;
  skipped: string[];
}

export interface ImportDoneMessage {
  type: 'IMPORT_DONE';
  summary: ImportSummary;
}

export type SandboxMessage = ExportReadyMessage | StatusMessage | ErrorMessage | ImportDoneMessage;
export type UIMessage = ExportMessage | ImportMessage;
