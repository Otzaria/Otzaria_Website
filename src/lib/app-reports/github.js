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

  async function call(method, path, body, url = `${API}/repos/${repo}${path}`) {
    let res;
    try {
      res = await fetchImpl(url, {
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
    if (data?.errors?.length) throw new GithubError(`GitHub ${path}: ${data.errors[0]?.message || ''}`, 422);
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
      return {
        number: d.number, state: d.state, state_reason: d.state_reason ?? null, url: d.html_url,
        closed_at: d.closed_at ?? null, closed_by: d.closed_by?.login ?? null,
      };
    },
    /** דורש הרשאת triage לחשבון הבוט במאגר. */
    async addAssignees(issueNumber, assignees) {
      await call('POST', `/issues/${issueNumber}/assignees`, { assignees });
    },
    /** reason: completed | not_planned */
    async closeIssue(issueNumber, reason) {
      await call('PATCH', `/issues/${issueNumber}`, { state: 'closed', state_reason: reason });
    },
    /** סגירה ככפול, עם הקישור ל-issue המקורי (כמו "Close as duplicate" באתר GitHub). */
    async closeAsDuplicate(issueNumber, duplicateOf) {
      const [issue, original] = await Promise.all([call('GET', `/issues/${issueNumber}`), call('GET', `/issues/${duplicateOf}`)]);
      await call('POST', '/graphql', {
        query: 'mutation($id:ID!,$dup:ID!){closeIssue(input:{issueId:$id,stateReason:DUPLICATE,duplicateIssueId:$dup}){issue{number}}}',
        variables: { id: issue.node_id, dup: original.node_id },
      }, `${API}/graphql`);
    },
    /** תגובות שעודכנו מאז `since` (ISO), בסדר כרונולוגי. */
    async listComments(issueNumber, since) {
      const qs = new URLSearchParams({ per_page: '100', ...(since ? { since } : {}) });
      const d = await call('GET', `/issues/${issueNumber}/comments?${qs}`);
      return (Array.isArray(d) ? d : []).map((c) => ({ body: c.body || '', author: c.user?.login ?? null, created_at: c.created_at }));
    },
  };
}

export const issueHtmlUrl = (repo, issueNumber) => `https://github.com/${repo}/issues/${issueNumber}`;
