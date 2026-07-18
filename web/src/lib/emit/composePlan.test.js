import { describe, it, expect } from 'vitest';
import { composePlan } from './composePlan.js';

const canvas = { w: 1024, h: 768 };

describe('composePlan — spatial (bbox present)', () => {
  const parent = { name: 'Dashboard', bbox: { x: 0, y: 0, w: 1, h: 1 } };
  const kids = [
    { name: 'Sidebar', bbox: { x: 0, y: 0, w: 0.25, h: 1 } },
    { name: 'Main',    bbox: { x: 0.25, y: 0.1, w: 0.75, h: 0.9 } },
  ];
  it('emits a box of absolutely-positioned component-refs', () => {
    const plan = composePlan(parent, kids, canvas);
    expect(plan.type).toBe('box');
    expect(plan.width).toBe(1024);
    expect(plan.height).toBe(768);
    expect(plan.children.map((c) => c.type)).toEqual(['component-ref', 'component-ref']);
    expect(plan.children[0]).toMatchObject({
      name: 'Sidebar', variant: null,
      absolute: { x: 0, y: 0, width: 256, height: 768 },
    });
    expect(plan.children[1].absolute).toEqual({ x: 256, y: 77, width: 768, height: 691 });
    expect(plan.children[0].fallback.type).toBe('box'); // fallback present
  });
  it('clamps negative offsets to 0', () => {
    const p = { name: 'P', bbox: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } };
    const c = [{ name: 'C', bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } }]; // starts before parent
    const plan = composePlan(p, c, canvas);
    expect(plan.children[0].absolute.x).toBe(0);
    expect(plan.children[0].absolute.y).toBe(0);
  });
});

describe('composePlan — flow (a child without bbox)', () => {
  const parent = { name: 'Layout' }; // no bbox
  const kids = [{ name: 'SidebarNav' }, { name: 'Header' }];
  it('emits a column box of component-refs without absolute', () => {
    const plan = composePlan(parent, kids, canvas);
    expect(plan.type).toBe('box');
    expect(plan.layout).toBe('column');
    expect(plan.children.map((c) => c.name)).toEqual(['SidebarNav', 'Header']);
    expect(plan.children.every((c) => c.type === 'component-ref' && !c.absolute)).toBe(true);
  });
});
