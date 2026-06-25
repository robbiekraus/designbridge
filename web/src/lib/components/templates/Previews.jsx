import React from 'react';
import { buttonTemplate } from './button.js';
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

export const PREVIEWS = {
  button: ({ variant, picks }) => (
    <button style={buttonTemplate.styleFor(variant, picks)}>Button</button>
  ),
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
