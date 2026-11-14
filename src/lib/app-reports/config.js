/**
 * הגדרות דיווחי התוכנה. היעדים קבועים בקוד (products.js); בלי טוקן הדיווחים נשמרים כ-issuePending וה-cron ינסה שוב.
 */
import { PRODUCTS, DEFAULT_PRODUCT } from './products.js';

export const DEFAULT_REPO = PRODUCTS[DEFAULT_PRODUCT].repo;
export const PUBLIC_SITE_URL = 'https://otzaria.org';

function dispatchToken(env) {
  const own = (env.APP_REPORTS_TRIAGE_DISPATCH_TOKEN || '').trim();
  if (own.toLowerCase() === 'off') return null;
  return own || (env.DICTA_LIBRARY_GITHUB_TOKEN || '').trim() || null;
}

function positiveMinutes(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getAppReportsConfig(env = process.env) {
  return {
    // אותו טוקן שהאתר כותב בו לספרייה, לכל המוצרים; לבוט יש issues על הריפו של כל מוצר.
    githubToken: (env.DICTA_LIBRARY_GITHUB_TOKEN || '').trim() || null,
    // ריפו אוצריא, לתאימות; הריפו של כל מוצר — getProduct(key).repo
    repo: DEFAULT_REPO,
    webhookSecret: (env.APP_REPORTS_WEBHOOK_SECRET || '').trim() || null,
    unsubscribeSecret: env.NEXTAUTH_SECRET || null,
    siteUrl: (env.NEXTAUTH_URL || PUBLIC_SITE_URL).replace(/\/+$/, ''),
    // תשובות במייל: הדומיין שה-Email Worker של Cloudflare מקבל עבורו (למשל reply.otzaria.org),
    // והסוד שה-Worker שולח ל-/api/app-reports/inbound-email. בלי שניהם — המענה חוזר ל-SMTP_REPLY_TO.
    replyDomain: (env.APP_REPORTS_REPLY_DOMAIN || '').trim().toLowerCase() || null,
    inboundSecret: (env.APP_REPORTS_INBOUND_SECRET || '').trim() || null,
    // בדיקה אוטומטית של תקיעות וקריסות לפני הפתיחה (docs/app-reports/TRIAGE.md). בלי הסוד — נפתחות מיד כמו קודם.
    triageSecret: (env.APP_REPORTS_TRIAGE_SECRET || '').trim() || null,
    // repository_dispatch שמעיר את השירות מיד: כברירת מחדל מפתח הספרייה (יש לו הרשאה על מאגר השירות).
    // off — בלי הערה, והשירות מושך את התור בעצמו (למשל cron על שרת האתר).
    triageDispatchToken: dispatchToken(env),
    triageDispatchRepo: (env.APP_REPORTS_TRIAGE_DISPATCH_REPO || '').trim() || 'Otzaria/app-report-triage',
    triageWaitMs: positiveMinutes(env.APP_REPORTS_TRIAGE_WAIT_MINUTES, 60) * 60 * 1000,
  };
}
