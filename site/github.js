// The person's own private data repo (FM-R01, FM-R50). Talks only to api.github.com, only for that repo.
// The token goes in a header, never in an address, a file or a log. As Photo Ctrl's.

const API = 'https://api.github.com';
const enc = new TextEncoder();
const dec = new TextDecoder();
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const bin = atob(String(s).replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
export const jsonBytes = (x) => enc.encode(JSON.stringify(x, null, 1) + '\n');

export const README = (repo) => `# Filament Ctrl data\n\nThe private record for [Filament Ctrl](https://woodwerd.github.io/filament-ctrl/): \`filament-ctrl.json\`, the materials list in \`catalog.json\`, and proposals from your own Claude in \`proposals/\`.\n\nKeep this repo private. Repo: ${repo}\n`;

// What went wrong, in plain words, and what to do (FM-S08, as PH-S10)
export function explain(status, repo, what = 'use') {
  if (status === 0) return { kind: 'offline', text: 'GitHub can\'t be reached. Changes wait until the connection is back.' };
  if (status === 401) return { kind: 'auth', text: `GitHub refused the token. It may have expired. Make a new one for ${repo} with Contents read and write, and connect again.` };
  if (status === 403) return { kind: 'rights', text: `The token can't ${what} ${repo}. Give it Contents read and write for this repo.` };
  if (status === 404) return { kind: 'missing', text: `There is no repo ${repo} that this token can see. Check the name, and that the token covers this repo.` };
  if (status === 'stale') return { kind: 'stale', text: 'Your record changed somewhere else since this page read it, from another device, tab or your Claude, so nothing was saved. It has been read again; make the change again if it\'s still needed.' };
  if (status === 'public') return { kind: 'public', text: `${repo} is public, so anyone could see your record. On GitHub, open the repo's Settings, then General, and under Danger Zone change its visibility to private. Then check again.` };
  return { kind: 'other', text: `GitHub answered ${status}. Nothing was lost. Try again in a minute.` };
}

export function client(repo, token, fetchFn = (...a) => fetch(...a)) {
  const call = async (path, opts = {}) => {
    let res;
    try {
      res = await fetchFn(`${API}/repos/${repo}${path}`, { ...opts, cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch { return { status: 0 }; }
    let json = null; try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, json };
  };
  const post = (path, body) => call(path, { method: 'POST', body: JSON.stringify(body) });
  // FM-A08 F5: the version of the record this page last read or wrote. A save over any other version is refused,
  // so a stale page or a second device never writes old data back. undefined until the first load.
  let known;
  const RECORD = 'filament-ctrl.json';

  async function head() {
    const r = await call('');
    if (r.status !== 200) return { error: explain(r.status, repo) };
    if (!r.json.private) return { error: explain('public', repo) }; // checked before every write
    const branch = r.json.default_branch || 'main';
    const ref = await call(`/git/ref/heads/${branch}`);
    if (ref.status === 404 || ref.status === 409) return { branch, commit: null, tree: null };
    if (ref.status !== 200) return { error: explain(ref.status, repo, 'read') };
    const c = await call(`/git/commits/${ref.json.object.sha}`);
    if (c.status !== 200) return { error: explain(c.status, repo, 'read') };
    return { branch, commit: ref.json.object.sha, tree: c.json.tree.sha };
  }

  // One commit holding every file change: { path, bytes }. FM-A10: one change, one commit.
  async function commit(files, message, tries = 3) {
    const h = await head();
    if (h.error) return h;
    const writesRecord = files.some((f) => f.path === RECORD);
    if (writesRecord && known !== undefined) {
      let now = null;
      if (h.commit) {
        const top = await call(`/git/trees/${h.tree}`);
        if (top.status !== 200) return { error: explain(top.status, repo, 'read') };
        now = top.json.tree.find((x) => x.path === RECORD)?.sha ?? null;
      }
      if (now !== known) return { error: explain('stale', repo) };
    }
    if (!h.commit) {
      const first = files[0] || { path: 'README.md', bytes: enc.encode(README(repo)) };
      const r = await call(`/contents/${first.path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64(first.bytes) }) });
      if (r.status !== 201 && r.status !== 200) return { error: explain(r.status, repo, 'write to') };
      if (first.path === RECORD) known = r.json.content.sha;
      return files.length > 1 ? commit(files.slice(1), message, tries) : { ok: true };
    }
    const tree = [];
    for (const f of files) {
      const b = await post('/git/blobs', { content: b64(f.bytes), encoding: 'base64' });
      if (b.status !== 201) return { error: explain(b.status, repo, 'write to') };
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.json.sha });
    }
    const t = await post('/git/trees', { base_tree: h.tree, tree });
    if (t.status !== 201) return { error: explain(t.status, repo, 'write to') };
    const c = await post('/git/commits', { message, tree: t.json.sha, parents: [h.commit] });
    if (c.status !== 201) return { error: explain(c.status, repo, 'write to') };
    const u = await call(`/git/refs/heads/${h.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.json.sha }) });
    if (u.status === 200) { const mine = tree.find((x) => x.path === RECORD); if (mine) known = mine.sha; return { ok: true, sha: c.json.sha }; }
    if (u.status === 422 && tries > 1) return commit(files, message, tries - 1);
    return { error: explain(u.status, repo, 'write to') };
  }

  async function json(path) {
    const r = await call(`/contents/${path}`);
    if (r.status === 404) return { missing: true };
    if (r.status !== 200) return { error: explain(r.status, repo, 'read') };
    try {
      if (r.json.content) return { json: JSON.parse(dec.decode(unb64(r.json.content))) };
      const b = await call(`/git/blobs/${r.json.sha}`); // over 1 MB, such as a full catalog
      return { json: JSON.parse(dec.decode(unb64(b.json.content))) };
    } catch { return { error: { kind: 'unreadable', text: `${path} couldn't be read.` } }; }
  }

  return {
    repo,
    async check() {
      const r = await call('');
      if (r.status !== 200) return { error: explain(r.status, repo) };
      return { private: !!r.json.private, canWrite: !!r.json.permissions?.push, name: r.json.full_name || repo };
    },
    json,
    // Everything the app reads, in as few calls as it takes.
    async load() {
      const h = await head();
      if (h.error) return h;
      if (!h.commit) { known = null; return { record: null, catalog: null, proposals: [], snapshot: null }; }
      const t = await call(`/git/trees/${h.tree}?recursive=1`);
      if (t.status !== 200) return { error: explain(t.status, repo, 'read') };
      const paths = new Set(t.json.tree.map((x) => x.path));
      known = t.json.tree.find((x) => x.path === RECORD)?.sha ?? null;
      const get = async (p) => (paths.has(p) ? (await json(p)).json ?? null : null);
      const props = [...paths].filter((p) => /^proposals\/[^/]+\.json$/.test(p));
      const snaps = [...paths].filter((p) => /^snapshots\/[^/]+\.json$/.test(p)).sort();
      return {
        record: await get('filament-ctrl.json'),
        catalog: await get('catalog.json'),
        proposals: (await Promise.all(props.map(async (p) => ({ path: p, ...(await get(p)) })))).filter((p) => p.format),
        snapshot: snaps.length ? await get(snaps.at(-1)) : null,
      };
    },
    save(files, message) { return commit(files.map((f) => ({ path: f.path, bytes: jsonBytes(f.json) })), message); },
    ensureReadme: async () => ((await call('/contents/README.md')).status === 200 ? { ok: true } : commit([{ path: 'README.md', bytes: enc.encode(README(repo)) }], 'Add README for Filament Ctrl')),
  };
}

// A stand-in for GitHub, for checking the screens on this computer only (as Photo Ctrl's tests).
// Reads standin/ next to the page, which is git-ignored; writes stay in memory.
export function standin() {
  const mem = new Map();
  const get = async (p) => { if (mem.has(p)) return structuredClone(mem.get(p)); const r = await fetch(`standin/${p}`, { cache: 'no-store' }); return r.ok ? r.json() : null; };
  return {
    repo: 'standin/filament-data',
    standin: true,
    async check() { return { private: true, canWrite: true, name: 'standin/filament-data' }; },
    async load() {
      const list = (await get('proposals.json')) || [];
      return { record: await get('filament-ctrl.json'), catalog: await get('catalog.json'),
        proposals: (await Promise.all(list.map(async (p) => ({ path: `proposals/${p}`, ...(await get(`proposals/${p}`)) })))).filter((p) => p.format),
        snapshot: null };
    },
    async save(files, message) { for (const f of files) mem.set(f.path, structuredClone(f.json)); console.info('stand-in commit:', message); return { ok: true }; },
    async ensureReadme() { return { ok: true }; },
  };
}
export const standinAllowed = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
