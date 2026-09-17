/**
 * GitHub מדומה ברמת fetch ל-issues בלבד (יצירה, תגובה, קריאה) — לבדיקות.
 */
export class FakeIssuesGitHub {
  constructor({ repo = 'Otzaria/otzaria' } = {}) {
    this.repo = repo;
    this.issues = new Map();
    this.comments = [];
    this.calls = [];
    this.failNext = 0;
    this.nextNumber = 100;
  }

  setState(number, state, stateReason = null) {
    const issue = this.issues.get(number);
    issue.state = state;
    issue.state_reason = stateReason;
  }

  fetch = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    this.calls.push({ method, path: u.pathname, body, headers: init.headers });
    if (this.failNext > 0) {
      this.failNext -= 1;
      return json(502, { message: 'Bad Gateway' });
    }
    const prefix = `/repos/${this.repo}`;
    if (!u.pathname.startsWith(prefix)) return json(404, { message: 'Not Found' });
    const rest = u.pathname.slice(prefix.length);
    let m;
    if (method === 'POST' && rest === '/issues') {
      const number = this.nextNumber++;
      // טוקן בלי triage: GitHub מתעלם מהתוויות בשקט
      const issue = { number, title: body.title, body: body.body, labels: [], state: 'open', state_reason: null, html_url: `https://github.com/${this.repo}/issues/${number}` };
      this.issues.set(number, issue);
      return json(201, issue);
    }
    if (method === 'POST' && (m = rest.match(/^\/issues\/(\d+)\/comments$/))) {
      const number = Number(m[1]);
      if (!this.issues.has(number)) return json(404, { message: 'Not Found' });
      const comment = { id: this.comments.length + 1, issue: number, body: body.body, html_url: `https://github.com/${this.repo}/issues/${number}#issuecomment-${this.comments.length + 1}` };
      this.comments.push(comment);
      return json(201, comment);
    }
    if (method === 'GET' && (m = rest.match(/^\/issues\/(\d+)$/))) {
      const issue = this.issues.get(Number(m[1]));
      return issue ? json(200, issue) : json(404, { message: 'Not Found' });
    }
    return json(404, { message: 'Not Found' });
  };
}

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
