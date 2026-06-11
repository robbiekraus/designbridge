function makeMockResult(source) {
  return {
    source,
    mocked: true,
    categories: [
      { key: 'colors', label: 'Colors', count: 11, confidence: 'med' },
      { key: 'typography', label: 'Typography', count: 5, confidence: 'med' },
      { key: 'spacing', label: 'Spacing', count: 7, confidence: 'med' },
      { key: 'radius', label: 'Border radius', count: 3, confidence: 'med' },
      { key: 'shadows', label: 'Shadows', count: 2, confidence: 'low' },
      {
        key: 'inventory',
        label: 'UI inventory',
        count: 9,
        confidence: 'med',
        extra: { atomics: 4, components: 3, patterns: 2 },
      },
    ],
    raw: null,
  };
}

export function mockUrlImport(url) {
  return new Promise(resolve => setTimeout(() => resolve(makeMockResult('url')), 1500));
}

export function mockRepoImport({ url, branch }) {
  return new Promise(resolve => setTimeout(() => resolve(makeMockResult('repo')), 1500));
}
