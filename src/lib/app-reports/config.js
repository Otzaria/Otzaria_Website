/**
 * הגדרות דיווחי התוכנה. היעד קבוע בקוד; בלי טוקן הדיווחים נשמרים כ-issuePending וה-cron ינסה שוב.
 */
export const DEFAULT_REPO = 'Otzaria/otzaria';
export const PUBLIC_SITE_URL = 'https://otzaria.org';

export function getAppReportsConfig(env = process.env) {
  return {
    // אותו טוקן שהאתר כותב בו לספרייה; לבוט יש issues על ריפו התוכנה.
    githubToken: (env.DICTA_LIBRARY_GITHUB_TOKEN || '').trim() || null,
    repo: DEFAULT_REPO,
    webhookSecret: (env.APP_REPORTS_WEBHOOK_SECRET || '').trim() || null,
    unsubscribeSecret: env.NEXTAUTH_SECRET || null,
    siteUrl: (env.NEXTAUTH_URL || PUBLIC_SITE_URL).replace(/\/+$/, ''),
  };
}
