import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { emitComponents } from './emitComponents.js';
import { repoCatalogOption } from '../catalog/buildRepoCatalog.js';
import { parseCva } from '../../../../server/lib/catalog/cvaParser.js';
import { readTheme } from '../../../../server/lib/catalog/themeReader.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '../../../..');
const buttonSrc = readFileSync(path.join(root, 'server/fixtures/shadcn-repo/components/ui/button.tsx'), 'utf8');
const globals = readFileSync(path.join(root, 'server/fixtures/shadcn-repo/app/globals.css'), 'utf8');

// Import-Pfad BEWUSST unterscheidbar vom Default ('@/components/ui/button'): Pfad ohne
// 'components/'-Segment → importFrom liefert '@/ui/button'. Taucht das im Emit auf, ist bewiesen,
// dass wirklich der Repo-Katalog gegroundet hat, nicht der Default.
function repoOption() {
  const entries = [{ path: 'ui/button.tsx', cva: parseCva(buttonSrc), source: buttonSrc }];
  return repoCatalogOption(entries, readTheme(globals));
}

function scanResult() {
  return {
    raw: {
      tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
      atoms: [{ name: 'Primary Action', variants: [], confidence: 'high', source: 'ai' }],
      molecules: [], organisms: [], templates: [],
    },
    interpretations: {
      'Primary Action': {
        html: '<button data-ds-component="Button" data-ds-variant="default">Speichern</button>',
        model: 'test',
      },
    },
  };
}

describe('Scheibe 2 End-to-End: emitComponents groundet gegen den User-Repo-Katalog', () => {
  it('reingereichter Repo-Katalog → Emit importiert die ECHTE User-Komponente', () => {
    const [atom] = emitComponents(scanResult(), 'atom', { catalog: repoOption() });
    expect(atom.grounded).toContain('Button');
    expect(atom.code).toMatch(/import \{ Button \} from "@\/ui\/button"/);
    expect(atom.code).toMatch(/<Button/);
  });

  it('Repo-Katalog auch über result.repoCatalog nutzbar', () => {
    const result = { ...scanResult(), repoCatalog: repoOption() };
    const [atom] = emitComponents(result, 'atom');
    expect(atom.code).toMatch(/@\/ui\/button/);
  });

  it('ohne Repo-Katalog → unveränderter Default-Pfad (rückwärtskompatibel)', () => {
    const [atom] = emitComponents(scanResult(), 'atom');
    expect(atom.grounded).toContain('Button');
    expect(atom.code).toMatch(/@\/components\/ui\/button/); // shadcn-Default
  });
});
