/**
 * GitHub מדומה ברמת fetch — לבדיקות בלבד. מממש את תת-הקבוצה של REST שבה
 * משתמש createRepoClient, כולל דחיית עדכון ענף שאינו fast-forward (422).
 */
import { createHash } from 'crypto';

const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const blobSha = (buf) => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

export class FakeGitHub {
  constructor({ repo = 'Otzaria/otzaria-library', branch = 'main', files = {} } = {}) {
    this.repo = repo;
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.refs = new Map();
    this.pulls = [];
    this.calls = [];
    this.hooks = {};
    const tree = this._putTree(this._filesToEntries(files));
    const c = this._putCommit({ message: 'initial', tree, parents: [] });
    this.refs.set(branch, c);
  }

  _putBlob(buf) {
    const sha = blobSha(buf);
    this.blobs.set(sha, buf);
    return sha;
  }

  _filesToEntries(files) {
    const m = new Map();
    for (const [p, content] of Object.entries(files)) m.set(p, this._putBlob(Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')));
    return m;
  }

  _putTree(entries) {
    const sorted = [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    const sha = sha1(`tree:${JSON.stringify(sorted)}`);
    this.trees.set(sha, new Map(sorted));
    return sha;
  }

  _putCommit({ message, tree, parents }) {
    const sha = sha1(`commit:${tree}:${parents.join(',')}:${message}:${this.commits.size}`);
    this.commits.set(sha, { sha, message, tree, parents });
    return sha;
  }

  /** דחיפה חיצונית (סימולציית עריכה מקבילה) — מחזיר sha של הקומיט. */
  pushExternal(branch, files, message = 'external edit') {
    const head = this.refs.get(branch);
    const entries = new Map(this.trees.get(this.commits.get(head).tree));
    for (const [p, content] of Object.entries(files)) entries.set(p, this._putBlob(Buffer.from(content, 'utf8')));
    const c = this._putCommit({ message, tree: this._putTree(entries), parents: [head] });
    this.refs.set(branch, c);
    return c;
  }

  readFile(branch, path) {
    const tree = this.trees.get(this.commits.get(this.refs.get(branch)).tree);
    const sha = tree.get(path);
    return sha ? this.blobs.get(sha).toString('utf8') : null;
  }

  fileSha(branch, path) {
    return this.trees.get(this.commits.get(this.refs.get(branch)).tree).get(path) || null;
  }

  headSha(branch) {
    return this.refs.get(branch);
  }

  _isAncestor(ancestor, sha) {
    const stack = [sha];
    const seen = new Set();
    while (stack.length) {
      const s = stack.pop();
      if (s === ancestor) return true;
      if (seen.has(s)) continue;
      seen.add(s);
      stack.push(...(this.commits.get(s)?.parents || []));
    }
    return false;
  }

  fetch = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(url);
    const prefix = `/repos/${this.repo}`;
    const body = init.body ? JSON.parse(init.body) : null;
    this.calls.push({ method, path: decodeURIComponent(u.pathname), body });
    if (this.hooks.beforeRequest) {
      const r = await this.hooks.beforeRequest({ method, path: decodeURIComponent(u.pathname), body });
      if (r) return r;
    }
    if (!u.pathname.startsWith(prefix)) return json(404, { message: 'Not Found' });
    const rest = decodeURIComponent(u.pathname.slice(prefix.length));
    const res = this._route(method, rest, u.searchParams, body);
    if (this.hooks.afterRequest) await this.hooks.afterRequest({ method, path: rest, body, res });
    return res;
  };

  _route(method, rest, q, body) {
    let m;
    if (method === 'GET' && (m = rest.match(/^\/branches\/(.+)$/))) {
      const sha = this.refs.get(m[1]);
      if (!sha) return json(404, { message: 'Branch not found' });
      return json(200, { name: m[1], commit: { sha, commit: { tree: { sha: this.commits.get(sha).tree } } } });
    }
    if (method === 'GET' && (m = rest.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = this.refs.get(m[1]);
      return sha ? json(200, { object: { sha } }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = rest.match(/^\/git\/commits\/([0-9a-f]{40})$/))) {
      const c = this.commits.get(m[1]);
      return c ? json(200, { sha: c.sha, message: c.message, tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })) }) : json(404, {});
    }
    if (method === 'GET' && (m = rest.match(/^\/contents\/(.+)$/))) {
      const ref = q.get('ref');
      const commitSha = this.commits.has(ref) ? ref : this.refs.get(ref);
      if (!commitSha) return json(404, {});
      const tree = this.trees.get(this.commits.get(commitSha).tree);
      const p = m[1];
      if (tree.has(p)) return json(200, { type: 'file', sha: tree.get(p), size: this.blobs.get(tree.get(p)).length, path: p });
      const children = new Map();
      for (const [fp, sha] of tree) {
        if (!fp.startsWith(`${p}/`)) continue;
        const tail = fp.slice(p.length + 1);
        const slash = tail.indexOf('/');
        if (slash === -1) children.set(tail, { name: tail, path: fp, sha, type: 'file', size: this.blobs.get(sha).length });
        else children.set(tail.slice(0, slash), { name: tail.slice(0, slash), path: `${p}/${tail.slice(0, slash)}`, sha: 'dir', type: 'dir' });
      }
      return children.size ? json(200, [...children.values()]) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = rest.match(/^\/git\/blobs\/([0-9a-f]{40})$/))) {
      const b = this.blobs.get(m[1]);
      return b ? json(200, { sha: m[1], encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') }) : json(404, {});
    }
    if (method === 'POST' && rest === '/git/blobs') return json(201, { sha: this._putBlob(Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')) });
    if (method === 'POST' && rest === '/git/trees') {
      const baseTree = this.trees.get(body.base_tree);
      if (!baseTree) return json(422, { message: 'bad base_tree' });
      const entries = new Map(baseTree);
      for (const e of body.tree) entries.set(e.path, e.sha || this._putBlob(Buffer.from(e.content, 'utf8')));
      return json(201, { sha: this._putTree(entries) });
    }
    if (method === 'POST' && rest === '/git/commits') {
      if (!this.trees.has(body.tree)) return json(422, { message: 'bad tree' });
      return json(201, { sha: this._putCommit({ message: body.message, tree: body.tree, parents: body.parents }) });
    }
    if (method === 'PATCH' && (m = rest.match(/^\/git\/refs\/heads\/(.+)$/))) {
      const cur = this.refs.get(m[1]);
      if (!cur) return json(422, { message: 'Reference does not exist' });
      if (body.force !== false) return json(400, { message: 'test fake requires force:false' });
      if (!this._isAncestor(cur, body.sha)) return json(422, { message: 'Update is not a fast forward' });
      this.refs.set(m[1], body.sha);
      return json(200, { object: { sha: body.sha } });
    }
    if (method === 'POST' && rest === '/git/refs') {
      const name = body.ref.replace(/^refs\/heads\//, '');
      if (this.refs.has(name)) return json(422, { message: 'Reference already exists' });
      this.refs.set(name, body.sha);
      return json(201, { ref: body.ref, object: { sha: body.sha } });
    }
    if (method === 'GET' && rest === '/commits') {
      let sha = this.refs.get(q.get('sha')) || q.get('sha');
      const path = q.get('path');
      const out = [];
      while (sha && out.length < Number(q.get('per_page') || 30)) {
        const c = this.commits.get(sha);
        if (!c) break;
        const parent = c.parents[0] ? this.commits.get(c.parents[0]) : null;
        const touched = !path || !parent || this.trees.get(c.tree).get(path) !== this.trees.get(parent.tree).get(path);
        if (touched) out.push({ sha: c.sha, commit: { message: c.message } });
        sha = c.parents[0];
      }
      return json(200, out);
    }
    if (method === 'POST' && rest === '/pulls') {
      const pr = { number: this.pulls.length + 1, html_url: `https://github.com/${this.repo}/pull/${this.pulls.length + 1}`, state: 'open', head: body.head, base: body.base, title: body.title, body: body.body, merged_at: null, merged: false };
      this.pulls.push(pr);
      return json(201, pr);
    }
    if (method === 'GET' && rest === '/pulls') {
      const head = q.get('head');
      const branch = head.includes(':') ? head.split(':')[1] : head;
      return json(200, this.pulls.filter((p) => p.head === branch));
    }
    if (method === 'GET' && (m = rest.match(/^\/pulls\/(\d+)$/))) {
      const pr = this.pulls[Number(m[1]) - 1];
      return pr ? json(200, pr) : json(404, {});
    }
    return json(404, { message: `fake: no route ${method} ${rest}` });
  }

  mergePull(number) {
    const pr = this.pulls[number - 1];
    const headSha = this.refs.get(pr.head);
    this.refs.set(pr.base, headSha);
    pr.state = 'closed';
    pr.merged = true;
    pr.merged_at = new Date().toISOString();
    pr.merge_commit_sha = headSha;
  }
}

export function json(status, obj, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
}
