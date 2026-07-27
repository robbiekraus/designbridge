import { describe, it, expect } from 'vitest';
import { matchTemplate, TEMPLATES } from './registry.js';

describe('template registry', () => {
  it('matches button-ish names to the button template', () => {
    expect(matchTemplate('Button')?.key).toBe('button');
    expect(matchTemplate('primary btn')?.key).toBe('button');
    expect(matchTemplate('CTA')?.key).toBe('button');
  });

  it('returns null for unknown names', () => {
    expect(matchTemplate('Hero section')).toBeNull();
    expect(matchTemplate('')).toBeNull();
  });

  it('button template emits token-themed jsx and flags low confidence', () => {
    const btn = TEMPLATES.find((t) => t.key === 'button');
    const picks = { primary: '#022d2c', onPrimary: '#fff', text: '#18181b',
      surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
      fontSize: '16px', fontWeight: '600' };
    const code = btn.emit(picks, { confidence: 'low' });
    expect(code).toContain('bg-[#022d2c]');
    expect(code).toContain('rounded-[8px]');
    expect(code).toContain('export function Button');
    expect(code).toContain('unsicher erkannt');
  });

  it('button styleFor returns an inline style per variant', () => {
    const btn = TEMPLATES.find((t) => t.key === 'button');
    const picks = { primary: '#022d2c', onPrimary: '#fff', text: '#18181b',
      surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
      fontSize: '16px', fontWeight: '600' };
    expect(btn.styleFor('primary', picks).background).toBe('#022d2c');
    expect(btn.styleFor('secondary', picks).borderColor).toBe('#e4e4e7');
  });

  it('matches badge / input names, but NOT card (Card-Template retired)', () => {
    expect(matchTemplate('Card')).toBeNull();
    expect(matchTemplate('tag pill')?.key).toBe('badge');
    expect(matchTemplate('text field')?.key).toBe('input');
  });

  it('each new template emits its own component name', () => {
    const picks = { primary: '#022d2c', onPrimary: '#fff', text: '#18181b',
      surface: '#fff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
      fontSize: '16px', fontWeight: '600' };
    expect(TEMPLATES.find((t) => t.key === 'badge').emit(picks, {})).toContain('export function Badge');
    expect(TEMPLATES.find((t) => t.key === 'input').emit(picks, {})).toContain('export function Input');
  });
});

describe('matchTemplate — cards are never a template match (Card-Template retired)', () => {
  it('remaining primitives still match a template', () => {
    expect(matchTemplate('Button')).toBeTruthy();
    expect(matchTemplate('Search Input')).toBeTruthy();
    expect(matchTemplate('Icon Button')).toBeTruthy();
  });

  it('no "…Card" name matches a template — plain or content-bearing', () => {
    expect(matchTemplate('Card')).toBeNull();
    expect(matchTemplate('Panel')).toBeNull();
    expect(matchTemplate('Stat Card')).toBeNull();
    expect(matchTemplate('Line Chart Card')).toBeNull();
    expect(matchTemplate('Metric Card')).toBeNull();
    expect(matchTemplate('Map Card')).toBeNull();
    expect(matchTemplate('Activity Feed Panel')).toBeNull();
    expect(matchTemplate('Category of Emissions Card')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(matchTemplate('stat card')).toBeNull();
    expect(matchTemplate('CARD')).toBeNull();
  });
});

describe('matchTemplate — dropdown triggers and compound search bars route to interpretation, not a generic template', () => {
  // Live-Fund 27.07. (Robs Sunstone-Scan, Testdaten/sunstone-scan-27-07.json): "Date Range
  // Dropdown Button" und "User Dropdown Button" matchten per Namensteil ("butt") das generische
  // Button-Template und wurden als leerer Farbklecks in Default-Größe statt als
  // Icon+Label+Chevron-Trigger gerendert (falsche Position/Größe, weil das Template die
  // gemessene bbox nie sieht). "Search Input Bar" matchte analog "Input" und wurde zur nackten
  // "Wert eingeben…"-Box statt Icon+Label-Suchfeld. Gleiches Fix-Muster wie das retired
  // Card-Template (Commit 623fc35, CONTENT_TOKENS).
  it('rejects dropdown-trigger names for the Button template', () => {
    expect(matchTemplate('Date Range Dropdown Button')).toBeNull();
    expect(matchTemplate('User Dropdown Button')).toBeNull();
    expect(matchTemplate('Select Menu Button')).toBeNull();
  });

  it('rejects compound bar/container names for the Input template', () => {
    expect(matchTemplate('Search Input Bar')).toBeNull();
  });

  it('still matches plain, non-compound Button/Input names (no regression)', () => {
    expect(matchTemplate('Button')?.key).toBe('button');
    expect(matchTemplate('Icon Button')?.key).toBe('button');
    expect(matchTemplate('primary btn')?.key).toBe('button');
    expect(matchTemplate('CTA')?.key).toBe('button');
    expect(matchTemplate('Search Input')?.key).toBe('input');
    expect(matchTemplate('text field')?.key).toBe('input');
  });

  it('is case-insensitive for the dropdown/bar exclusions', () => {
    expect(matchTemplate('date range DROPDOWN button')).toBeNull();
    expect(matchTemplate('search input BAR')).toBeNull();
  });
});
