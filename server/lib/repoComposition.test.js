import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRepoComposition } from './repoComposition.js';

const items = [
  { name: 'Layout', path: 'src/components/Layout.tsx' },
  { name: 'SidebarNav', path: 'src/components/SidebarNav.tsx' },
  { name: 'Header', path: 'src/components/Header.tsx' },
  { name: 'Button', path: 'src/components/ui/Button.tsx' },
];
const files = {
  'src/components/Layout.tsx':
    "import SidebarNav from './SidebarNav';\nimport Header from './Header';\nexport default function Layout(){return(<div><SidebarNav/><Header/></div>);}",
  'src/components/SidebarNav.tsx':
    "import Button from './ui/Button';\nexport default function SidebarNav(){return(<nav><Button/></nav>);}",
  'src/components/Header.tsx': "export default function Header(){return <header/>;}",
  'src/components/ui/Button.tsx': "export default function Button(){return <button/>;}",
};

test('direct edges from JSX usage', () => {
  const { children, roots } = buildRepoComposition(items, files);
  assert.deepEqual(children['Layout'].sort(), ['Header', 'SidebarNav']);
  assert.deepEqual(children['SidebarNav'], ['Button']);
  assert.deepEqual(roots, ['Layout']);
});

test('transitive reduction: Button hangs on SidebarNav not Layout', () => {
  const f = { ...files,
    'src/components/Layout.tsx':
      "import SidebarNav from './SidebarNav';\nimport Button from './ui/Button';\nexport default function Layout(){return(<div><SidebarNav/><Button/></div>);}" };
  const { children } = buildRepoComposition(items, f);
  assert.ok(!children['Layout'].includes('Button'));
  assert.deepEqual(children['SidebarNav'], ['Button']);
});

test('no edge for non-imported identifier of same name', () => {
  const f = { ...files,
    'src/components/Header.tsx': "export default function Header(){return <Button/>;}" }; // uses but not imported
  const { children } = buildRepoComposition(items, f);
  assert.equal((children['Header'] || []).includes('Button'), false);
});

test('ambiguous identifier produces no edge', () => {
  const amb = [...items, { name: 'Button2', path: 'src/components/ui/Button.tsx' }]; // same basename Button
  const { children } = buildRepoComposition(amb, files);
  // "Button" is ambiguous → SidebarNav gets no Button edge
  assert.equal((children['SidebarNav'] || []).includes('Button'), false);
});

test('html tags ignored', () => {
  const { children } = buildRepoComposition(items, files);
  assert.equal((children['Button'] || []).length, 0); // <button> lowercase ignored
});

test('children in first-appearance order', () => {
  const f = { ...files,
    'src/components/Layout.tsx':
      "import Header from './Header';\nimport SidebarNav from './SidebarNav';\nexport default function Layout(){return(<div><Header/><SidebarNav/></div>);}" };
  const { children } = buildRepoComposition(items, f);
  assert.deepEqual(children['Layout'], ['Header', 'SidebarNav']);
});
