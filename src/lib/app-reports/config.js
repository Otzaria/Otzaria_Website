/**
 * הגדרות דיווחי התוכנה. היעדים קבועים בקוד (products.js); בלי טוקן הדיווחים נשמרים כ-issuePending וה-cron ינסה שוב.
 */
import { PRODUCTS, DEFAULT_PRODUCT } from './products.js';

export const DEFAULT_REPO = PRODUCTS[DEFAULT_PRODUCT].repo;
export const PUBLIC_SITE_URL = 'https://otzaria.org';

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
  };
}
