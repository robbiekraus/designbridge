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
        // Primär = schwarz/zink (zurück vom Indigo-Rebrand). Token-Namen
        // bleiben, damit bg-primary/primary-soft überall greifen.
        primary: {
          DEFAULT: '#18181b', // zinc-900
          hover: '#3f3f46', // zinc-700
          soft: '#f4f4f5', // zinc-100
          ink: '#18181b', // zinc-900
        },
        ink: '#141418',
      },
    },
  },
  plugins: [],
};
