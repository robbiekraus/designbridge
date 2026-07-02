const plugin = require('tailwindcss/plugin');

module.exports = {
  content: ['./app/**/*.{js,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#022d2c',
        accent: '#f97316',
        blue: { 500: '#3b82f6' },
        border: 'hsl(var(--border))',
      },
      spacing: { sm: '0.5rem', md: '1rem' },
      borderRadius: { card: '12px' },
      boxShadow: { card: '0 1px 3px rgba(0,0,0,.1)' },
      fontSize: { base: '1rem', xl: ['1.25rem', { lineHeight: '1.75rem' }] },
    },
  },
  plugins: [plugin(() => {})],
};
