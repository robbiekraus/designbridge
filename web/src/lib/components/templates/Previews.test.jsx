import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PREVIEWS } from './Previews.jsx';

const picks = { primary: '#022d2c', onPrimary: '#ffffff', text: '#18181b',
  surface: '#ffffff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
  fontSize: '16px', fontWeight: '600' };

describe('PREVIEWS', () => {
  it('renders a primary button preview using the primary token color', () => {
    const Button = PREVIEWS.button;
    const { getByText } = render(<Button variant="primary" picks={picks} />);
    const el = getByText('Button');
    expect(el.style.background).toContain('rgb(2, 45, 44)');
  });

  it('has a preview for every template key', () => {
    ['button', 'card', 'badge', 'input'].forEach((k) => {
      expect(typeof PREVIEWS[k]).toBe('function');
    });
  });

  it('ghost button uses the accent (primary) color, distinct from secondary', () => {
    const Button = PREVIEWS.button;
    const ghost = render(<Button variant="ghost" picks={picks} />).container.querySelector('button');
    const secondary = render(<Button variant="secondary" picks={picks} />).container.querySelector('button');
    // ghost: Akzentfarbe, kein sichtbarer Rahmen
    expect(ghost.style.color).toContain('rgb(2, 45, 44)'); // primary #022d2c
    expect(ghost.style.borderColor).not.toContain('rgb(228, 228, 231)'); // nicht der border-Token
    // secondary: neutraler Text + sichtbarer Rahmen → klar anders als ghost
    expect(secondary.style.borderColor).toContain('rgb(228, 228, 231)'); // border #e4e4e7
    expect(secondary.style.color).not.toBe(ghost.style.color);
  });

  it('renders an icon (svg) and no text for an Icon Button, keyed by name', () => {
    const Button = PREVIEWS.button;
    const { container, queryByText } = render(
      <Button variant="primary" picks={picks} name="Icon Button" />
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(queryByText('Button')).toBeNull();
  });

  it('a plain Button (no icon in name) still renders its text label', () => {
    const Button = PREVIEWS.button;
    const { getByText, container } = render(
      <Button variant="primary" picks={picks} name="Button" />
    );
    expect(getByText('Button')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });
});
