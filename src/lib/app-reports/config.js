/**
 * הגדרות דיווחי התוכנה מ-env. בלי טוקן הדיווחים נשמרים כ-issuePending וה-cron ינסה שוב.
 */
const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export const DEFAULT_REPO = 'Otzaria/otzaria';
export const PUBLIC_SITE_URL = 'https://otzaria.org';

export function getAppReportsConfig(env = process.env) {
  const rawRepo = (env.APP_REPORTS_GITHUB_REPO || '').trim();
  const repo = REPO_RE.test(rawRepo) ? rawRepo : DEFAULT_REPO;
  return {
    // ריק: הטוקן שהאתר כבר כותב בו לספרייה. לבוט יש issues על ריפו התוכנה.
    githubToken: (env.APP_REPORTS_GITHUB_TOKEN || env.DICTA_LIBRARY_GITHUB_TOKEN || '').trim() || null,
    githubTokenSetAt: (env.APP_REPORTS_GITHUB_TOKEN_SET_AT || '').trim() || null,
    repo,
    repoMisconfigured: Boolean(rawRepo) && rawRepo !== repo,
    webhookSecret: (env.APP_REPORTS_WEBHOOK_SECRET || '').trim() || null,
    unsubscribeSecret: env.APP_REPORTS_UNSUBSCRIBE_SECRET || env.NEXTAUTH_SECRET || null,
    siteUrl: (env.NEXTAUTH_URL || PUBLIC_SITE_URL).replace(/\/+$/, ''),
  };
}
