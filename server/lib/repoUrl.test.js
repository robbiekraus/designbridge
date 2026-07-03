import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoUrl } from './repoUrl.js';

test('parses a plain github repo url', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/shadcn-ui/ui'), {
    owner: 'shadcn-ui', repo: 'ui', branch: null,
  });
});

test('tolerates .git suffix and trailing slash', () => {
  assert.equal(parseRepoUrl('https://github.com/a/b.git').repo, 'b');
  assert.equal(parseRepoUrl('https://github.com/a/b/').repo, 'b');
});

test('extracts a branch from /tree/, including slashes', () => {
  assert.equal(parseRepoUrl('https://github.com/a/b/tree/main').branch, 'main');
  assert.equal(parseRepoUrl('https://github.com/a/b/tree/feat/x').branch, 'feat/x');
});

test('rejects non-github hosts and incomplete paths', () => {
  assert.throws(() => parseRepoUrl('https://gitlab.com/a/b'), /github\.com/);
  assert.throws(() => parseRepoUrl('https://github.com/only-owner'), /owner und repo/);
  assert.throws(() => parseRepoUrl('kein link'), /Ungültige URL/);
});
