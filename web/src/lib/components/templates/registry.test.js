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

  it('matches card / badge / input names', () => {
    expect(matchTemplate('Card')?.key).toBe('card');
    expect(matchTemplate('tag pill')?.key).toBe('badge');
    expect(matchTemplate('text field')?.key).toBe('input');
  });

  it('each new template emits its own component name', () => {
    const picks = { primary: '#022d2c', onPrimary: '#fff', text: '#18181b',
      surface: '#fff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
      fontSize: '16px', fontWeight: '600' };
    expect(TEMPLATES.find((t) => t.key === 'card').emit(picks, {})).toContain('export function Card');
    expect(TEMPLATES.find((t) => t.key === 'badge').emit(picks, {})).toContain('export function Badge');
    expect(TEMPLATES.find((t) => t.key === 'input').emit(picks, {})).toContain('export function Input');
  });
});
