export const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.git', '.next',
  'coverage', 'vendor', '.turbo', 'storybook-static',
]);

export const isTailwindConfig = (p) => /(^|\/)tailwind\.config\.(js|ts|cjs|mjs)$/.test(p);
export const isCssFile = (p) => /\.css$/.test(p);
export const isUiComponent = (p) => /(^|\/)components\/ui\/(?!index\.)[^/]+\.(jsx|tsx|js|ts)$/.test(p);
export const isComponentFile = (p) => /(^|\/)components\/(?!ui\/)[^/]+\.(jsx|tsx)$/.test(p);
export const isPageFile = (p) =>
  /(^|\/)pages\/.+\.(jsx|tsx|js|ts)$/.test(p) || /(^|\/)app\/(.*\/)?page\.(jsx|tsx|js|ts)$/.test(p);
export const isLayoutFile = (p) => /(^|\/)app\/(.*\/)?layout\.(jsx|tsx|js|ts)$/.test(p);

export const shouldSkipPath = (p) =>
  p.split('/').some((seg) => SKIP_DIRS.has(seg) || seg.startsWith('._'));
