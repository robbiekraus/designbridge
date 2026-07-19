/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#6366F1',
          hover: '#4F52E0',
          soft: '#EFECFF',
          ink: '#4A3AD1',
        },
        ink: '#141418',
        spectrum: {
          indigo: '#6366F1',
          cyan: '#06B6D4',
          green: '#10B981',
          amber: '#F59E0B',
          pink: '#EC4899',
        },
      },
    },
  },
  plugins: [],
};
