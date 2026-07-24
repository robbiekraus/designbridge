import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  // Ingest legt die Stories hierher ab; die shadcn-Stubs liegen unter components/ui.
  stories: ['../stories/**/*.stories.jsx'],
  addons: ['@storybook/addon-essentials'],
  framework: { name: '@storybook/react-vite', options: {} },
  async viteFinal(config) {
    // '@' → Harness-Wurzel (wie in shadcn-Projekten: @ = src-Root), damit
    // gegroundete Imports @/components/ui/button → components/ui/button.jsx auflösen.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(dirname, '..'),
    };
    // Automatischer JSX-Runtime: der emittierte Komponenten-Code importiert React
    // bewusst NICHT (wie die web/-App). esbuild klassisch würde React.createElement
    // ohne Import erzeugen ("React is not defined") — automatic injiziert stattdessen
    // react/jsx-runtime.
    config.esbuild = { ...(config.esbuild || {}), jsx: 'automatic' };
    return config;
  },
};
