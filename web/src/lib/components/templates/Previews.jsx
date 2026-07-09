import React from 'react';
import { buttonTemplate } from './button.js';
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

// generisches Icon (Plus) für Icon-Buttons — erbt die Textfarbe der Variante
function GlyphIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export const PREVIEWS = {
  button: ({ variant, picks, name }) => {
    const isIcon = /\bicon\b/i.test(name ?? '');
    const style = buttonTemplate.styleFor(variant, picks);
    if (isIcon) {
      return (
        <button style={{ ...style, padding: '8px', width: 36, height: 36 }} aria-label="Icon Button">
          <GlyphIcon />
        </button>
      );
    }
    return <button style={style}>Button</button>;
  },
  card: ({ variant, picks }) => (
    <div style={cardTemplate.styleFor(variant, picks)}>Card-Inhalt</div>
  ),
  badge: ({ variant, picks }) => (
    <span style={badgeTemplate.styleFor(variant, picks)}>Badge</span>
  ),
  input: ({ variant, picks }) => (
    <input
      style={inputTemplate.styleFor(variant, picks)}
      placeholder="Eingabe"
      readOnly
      disabled={variant === 'disabled'}
    />
  ),
};
