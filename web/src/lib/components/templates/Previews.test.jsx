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
});
