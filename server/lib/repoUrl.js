const NAME = /^[\w.-]+$/;

export function parseRepoUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    throw new Error('Ungültige URL.');
  }
  if (u.hostname !== 'github.com') {
    throw new Error('Nur github.com-URLs werden unterstützt.');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('URL muss owner und repo enthalten (github.com/owner/repo).');
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!NAME.test(owner) || !NAME.test(repo)) {
    throw new Error('Ungültiger owner-/repo-Name.');
  }
  let branch = null;
  if (parts[2] === 'tree' && parts.length > 3) branch = parts.slice(3).join('/');
  return { owner, repo, branch };
}
