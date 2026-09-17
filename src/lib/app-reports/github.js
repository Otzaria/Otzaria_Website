/**
 * לקוח GitHub מינימלי ל-issues של דיווחי התוכנה (טוקן בוט בלי הרשאות triage).
 */
const API = 'https://api.github.com';
const TIMEOUT_MS = 15000;

export class GithubError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
  }
}

/**
 * @param {{token:string, repo:string, fetchImpl?:typeof fetch}} opts
 */
export function createGithubClient({ token, repo, fetchImpl = fetch }) {
  if (!token) throw new Error('GitHub token missing');

  async function call(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${API}/repos/${repo}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'otzaria-app-reports',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new GithubError(`GitHub request failed: ${err?.message}`, 0);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* גוף שאינו JSON */ }
    if (!res.ok) throw new GithubError(`GitHub ${method} ${path} → ${res.status}: ${data?.message || ''}`, res.status);
    return data;
  }

  return {
    repo,
    async createIssue({ title, body, labels }) {
      const d = await call('POST', '/issues', { title, body, labels });
      return { number: d.number, url: d.html_url, state: d.state };
    },
    async createComment(issueNumber, body) {
      const d = await call('POST', `/issues/${issueNumber}/comments`, { body });
      return { url: d.html_url };
    },
    async getIssue(issueNumber) {
      const d = await call('GET', `/issues/${issueNumber}`);
      return { number: d.number, state: d.state, state_reason: d.state_reason ?? null, url: d.html_url };
    },
  };
}

export const issueHtmlUrl = (repo, issueNumber) => `https://github.com/${repo}/issues/${issueNumber}`;
