/**
 * הגדרות מערכת תיקוני הטקסט. סודות וכתובות השירות מ-env בלבד; מתגי ההתנהגות
 * (קליטה, מצב פרסום, פרסום אוטומטי, השהיית השירות) מגיעים מ-SystemConfig דרך מסך הניהול.
 */
import { DEFAULT_DIFF_CONTEXT_LINES } from './unified-diff.js';
import { getGithubToken } from '../github/botToken.js';
import { readAgentEnv } from './agent-auth.js';

export const AUTHORITY = Object.freeze({ NONE: 'none', TECHNICAL_ONLY: 'technical_only', FULL: 'technical_and_content' });
export const PUBLISH_MODES = Object.freeze(['disabled', 'pr', 'direct']);
// push: האתר פונה לשירות (CORRECTIONS_VERIFY_URL). pull: השירות מושך עבודה מ-/api/worker/v1/corrections.
export const VERIFY_TRANSPORTS = Object.freeze(['push', 'pull']);

// ---- קבועי כוונון: אינם ניתנים להגדרה, שינוי דורש שינוי קוד ----
export const SOURCE_REPO = 'Otzaria/otzaria-library';
export const SOURCE_REF = 'main';
export const PUBLISH_REPO = SOURCE_REPO;
export const PUBLISH_BRANCH = SOURCE_REF;
export const VERIFY_MAX_ATTEMPTS = 6;
export const VERIFY_MAX_TOTAL_SECONDS = 86_400;
export const VERIFY_TIMEOUT_MS = 20_000;
export const VERIFY_BACKOFF_BASE_SECONDS = 30;
export const VERIFY_BACKOFF_CAP_SECONDS = 3_600;
export const PUBLISH_MAX_REF_RETRIES = 3;
export const PUBLISH_MAX_ATTEMPTS = 5;
// PR שנסגר בלי מיזוג (absorption.js): מנהל הספרייה מחיל PRs בקומיט מקומי ודוחף ל-main אחר כך.
// כמה זמן ממתינים לתיקון ב-main מרגע שהסגירה זוהתה, לפני שהדיווח חוזר לידני; ועד כמה שורות
// מהיעד (שורות שנוספו/נמחקו לפניו) שורה מתוקנת שזזה עדיין נחשבת אותה שורה.
export const PR_ABSORPTION_GRACE_SECONDS = 14 * 86_400;
export const PR_ABSORPTION_RELOCATION_LINES = 50;
// תוויות שמנהל הספרייה שם על PR שנסגר כדי לומר "לא נקלט" (בלי תלות ברישיות): ידני מיד, בלי המתנה.
// תווית לעולם אינה סוגרת דיווח כפורסם — רק בדיקת התוכן ב-main.
export const PR_REJECTED_LABELS = Object.freeze(['לא נקלט', 'rejected', 'wontfix', 'invalid']);
// מטמון נפרד לקבצים שנבדקים לקליטה, כדי שקבצים ענקיים לא ידחקו את מטמון התצוגה והפרסום.
export const PR_ABSORPTION_CACHE_BYTES = 32 * 1024 * 1024;
export const WORKER_BATCH_SIZE = 10;
export const WORKER_CONCURRENCY = 2;
export const JOB_LEASE_SECONDS = 120;
// חייב לכסות מחזור cron שלם (10 דקות) ועוד מרווח, אחרת הבריאות תתריע בין הרצה להרצה.
export const HEARTBEAT_STALE_SECONDS = 900;
export const MANUAL_CLAIM_MINUTES = 7 * 24 * 60;
export const SOURCE_CACHE_BYTES = 64 * 1024 * 1024;
export const SOURCE_HEAD_TTL_SECONDS = 30;
export const DIFF_CONTEXT_LINES = DEFAULT_DIFF_CONTEXT_LINES;
// ---- מצב משיכה (CONTRACT §3.7) ----
// מועד המיצוי במשיכה, בשעות שאינן שבת/יו"ט (CORRECTIONS_VERIFY_DEADLINE_HOURS); מחוץ לטווח — נחתך ומדווח.
export const VERIFY_DEADLINE_HOURS_DEFAULT = 24;
export const VERIFY_DEADLINE_HOURS_MIN = 1;
export const VERIFY_DEADLINE_HOURS_MAX = 168;
// lease של משימה שנמסרה לשירות; הדופק מאריך אותו. אחרי AGENT_MAX_LEASE_EXPIRIES פקיעות → ידני.
export const AGENT_LEASE_SECONDS = 600;
export const AGENT_MAX_LEASE_EXPIRIES = 5;
// Retry-After ב-204: אין עבודה / הבדיקה כבויה או מושהית.
export const AGENT_IDLE_RETRY_SECONDS = 60;
export const AGENT_DISABLED_RETRY_SECONDS = 300;
// כמה משימות נבדקות בתפיסה אחת (משימה שהמקור שלה לא אותר עוברת לידני, ונבדקת הבאה).
export const AGENT_CLAIM_SCAN = 10;
// תקציב הזמן של תפיסה אחת, ו-Retry-After כשהוא נגמר או כשהסריקה דילגה על כל המשימות שבדקה.
export const AGENT_CLAIM_BUDGET_MS = 20_000;
export const AGENT_BUSY_RETRY_SECONDS = 5;
// במשיכה התפיסות מריצות אצווה מלאה (פרסום, מעקב PR) כשלא רצה אחת זמן כזה — גם בלי cron.
export const AGENT_BATCH_INTERVAL_SECONDS = 600;
export const AGENT_MAX_RESULT_BYTES = 1024 * 1024;
// דף הבריאות: שירות שלא פנה זמן רב כשיש משימות ממתינות.
export const AGENT_STALE_SECONDS = 1_800;

/** המתגים שמנוהלים במסך הניהול (SystemConfig) ולא ב-env. */
export const RUNTIME_SWITCHES = Object.freeze(['intakeEnabled', 'publishMode', 'autoPublish', 'verifyPaused']);

const bool = (v, dflt) => {
  if (v === undefined || v === null || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
};

function isLocalHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h) || h === '0.0.0.0';
}

/**
 * @param {Record<string,string|undefined>} env
 * @param {{verifyPaused?:boolean, intakeEnabled?:boolean, publishMode?:string, autoPublish?:boolean}} [runtime]
 *        מתגי ההתנהגות מ-SystemConfig (מסך הניהול)
 */
export function getCorrectionsConfig(env = process.env, runtime = {}) {
  const production = env.NODE_ENV === 'production';
  const errors = [];

  // ---- שירות הבדיקה ----
  const verifyRequested = bool(env.CORRECTIONS_VERIFY_ENABLED, false);
  const rawUrl = (env.CORRECTIONS_VERIFY_URL || '').trim();
  const secret = env.CORRECTIONS_VERIFY_SECRET || '';
  const isMock = bool(env.CORRECTIONS_VERIFY_MOCK, false);
  let verifyUrl = null;
  let verifyDisabledReason = null;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.username || u.password || u.search || u.hash) throw new Error('credentials/query not allowed');
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !production)) throw new Error('https required');
      if (production && isLocalHost(u.hostname)) throw new Error('local verify url in production');
      verifyUrl = u.toString().replace(/\/+$/, '');
    } catch (e) {
      errors.push(`CORRECTIONS_VERIFY_URL: ${e.message}`);
    }
  }
  if (production && isMock) errors.push('CORRECTIONS_VERIFY_MOCK is forbidden in production');

  // אופן ההעברה: push (ברירת המחדל, ההתנהגות הקיימת) או pull. ערך לא מוכר = השירות כבוי.
  const rawTransport = String(env.CORRECTIONS_VERIFY_TRANSPORT || 'push').trim().toLowerCase();
  const transportValid = VERIFY_TRANSPORTS.includes(rawTransport);
  if (!transportValid) errors.push('CORRECTIONS_VERIFY_TRANSPORT invalid');
  const transport = transportValid ? rawTransport : 'push';
  const pull = transport === 'pull';
  // במשיכה אין כתובת וסוד של שירות: נדרשים סוד ומזהה לסוכן, נפרדים מאלה של עובד ה-OCR.
  const agent = readAgentEnv(env);
  if (pull) errors.push(...agent.errors);
  let deadlineHours = VERIFY_DEADLINE_HOURS_DEFAULT;
  const rawDeadline = String(env.CORRECTIONS_VERIFY_DEADLINE_HOURS ?? '').trim();
  if (rawDeadline) {
    const hours = Number(rawDeadline);
    if (!Number.isFinite(hours)) {
      if (pull) errors.push('CORRECTIONS_VERIFY_DEADLINE_HOURS invalid');
    } else {
      deadlineHours = Math.min(VERIFY_DEADLINE_HOURS_MAX, Math.max(VERIFY_DEADLINE_HOURS_MIN, hours));
      if (pull && deadlineHours !== hours) errors.push(`CORRECTIONS_VERIFY_DEADLINE_HOURS out of range (${VERIFY_DEADLINE_HOURS_MIN}-${VERIFY_DEADLINE_HOURS_MAX})`);
    }
  }

  if (!verifyRequested) verifyDisabledReason = 'service_disabled';
  else if (!transportValid) verifyDisabledReason = 'service_misconfigured';
  else if (pull && agent.problem) verifyDisabledReason = agent.problem;
  else if (!pull && !rawUrl) verifyDisabledReason = 'service_not_configured';
  else if (!pull && !verifyUrl) verifyDisabledReason = 'service_misconfigured';
  else if (!pull && !secret) verifyDisabledReason = 'service_secret_missing';
  else if (production && isMock) verifyDisabledReason = 'mock_forbidden_in_production';
  else if (runtime?.verifyPaused) verifyDisabledReason = 'service_paused';

  let authority = String(env.CORRECTIONS_VERIFY_AUTHORITY || AUTHORITY.TECHNICAL_ONLY).trim();
  if (!Object.values(AUTHORITY).includes(authority)) {
    errors.push('CORRECTIONS_VERIFY_AUTHORITY invalid');
    authority = AUTHORITY.NONE;
  }
  // mock לעולם אינו מקבל סמכות אישור מלאה בייצור (גם אם שאר ההגדרות תקינות).
  if (production && isMock) authority = AUTHORITY.NONE;

  let requestedScope = String(env.CORRECTIONS_VERIFY_REQUESTED_SCOPE || AUTHORITY.TECHNICAL_ONLY).trim();
  if (requestedScope !== AUTHORITY.TECHNICAL_ONLY && requestedScope !== AUTHORITY.FULL) requestedScope = AUTHORITY.TECHNICAL_ONLY;
  if (requestedScope === AUTHORITY.FULL && authority !== AUTHORITY.FULL) requestedScope = AUTHORITY.TECHNICAL_ONLY;

  // ---- פרסום ----
  // טוקן יחיד לכל כתיבות ה-GitHub של האתר; היעד קבוע בקוד, המצב נבחר במסך הניהול.
  const token = getGithubToken(env) || '';
  let publishMode = typeof runtime?.publishMode === 'string' ? runtime.publishMode.trim() : 'disabled';
  if (!PUBLISH_MODES.includes(publishMode)) {
    errors.push('publish mode invalid');
    publishMode = 'disabled';
  }
  let publishDisabledReason = null;
  if (publishMode === 'disabled') publishDisabledReason = 'publish_disabled';
  else if (!token) publishDisabledReason = 'publish_token_missing';
  if (publishDisabledReason && publishDisabledReason !== 'publish_disabled') errors.push(`publish: ${publishDisabledReason}`);

  return {
    production,
    errors,
    intakeEnabled: runtime?.intakeEnabled !== false,
    verifyPaused: runtime?.verifyPaused === true,
    verify: {
      enabled: verifyDisabledReason === null,
      disabledReason: verifyDisabledReason,
      transport,
      url: verifyUrl,
      secret,
      // מצב משיכה: ה-API של הסוכן פתוח רק כש-transport=pull ו-agentProblem=null (agent-auth.js).
      agentId: agent.agentId,
      agentSecret: agent.secret,
      agentProblem: agent.problem,
      deadlineHours,
      isMock,
      authority: verifyDisabledReason === null ? authority : AUTHORITY.NONE,
      requestedScope,
      autoRejectAllowed: bool(env.CORRECTIONS_VERIFY_AUTO_REJECT, false) && !(production && isMock),
      maxAttempts: VERIFY_MAX_ATTEMPTS,
      maxTotalSeconds: VERIFY_MAX_TOTAL_SECONDS,
      timeoutMs: VERIFY_TIMEOUT_MS,
      backoffBaseSeconds: VERIFY_BACKOFF_BASE_SECONDS,
      backoffCapSeconds: VERIFY_BACKOFF_CAP_SECONDS,
    },
    autoPublish: runtime?.autoPublish === true && !(production && isMock),
    publish: {
      mode: publishDisabledReason ? 'disabled' : publishMode,
      requestedMode: publishMode,
      disabledReason: publishDisabledReason,
      repo: PUBLISH_REPO,
      branch: PUBLISH_BRANCH,
      token,
      maxRefRetries: PUBLISH_MAX_REF_RETRIES,
      maxAttempts: PUBLISH_MAX_ATTEMPTS,
      absorptionGraceSeconds: PR_ABSORPTION_GRACE_SECONDS,
      absorptionRelocationLines: PR_ABSORPTION_RELOCATION_LINES,
      rejectedLabels: PR_REJECTED_LABELS,
      absorptionCacheBytes: PR_ABSORPTION_CACHE_BYTES,
    },
    source: { repo: SOURCE_REPO, ref: SOURCE_REF, token },
    worker: {
      batchSize: WORKER_BATCH_SIZE,
      concurrency: WORKER_CONCURRENCY,
      leaseSeconds: JOB_LEASE_SECONDS,
      staleHeartbeatSeconds: HEARTBEAT_STALE_SECONDS,
    },
    agent: {
      leaseSeconds: AGENT_LEASE_SECONDS,
      maxLeaseExpiries: AGENT_MAX_LEASE_EXPIRIES,
      idleRetrySeconds: AGENT_IDLE_RETRY_SECONDS,
      disabledRetrySeconds: AGENT_DISABLED_RETRY_SECONDS,
      claimScan: AGENT_CLAIM_SCAN,
      claimBudgetMs: AGENT_CLAIM_BUDGET_MS,
      busyRetrySeconds: AGENT_BUSY_RETRY_SECONDS,
      batchIntervalSeconds: AGENT_BATCH_INTERVAL_SECONDS,
      maxResultBytes: AGENT_MAX_RESULT_BYTES,
      staleSeconds: AGENT_STALE_SECONDS,
    },
    manual: { claimMinutes: MANUAL_CLAIM_MINUTES },
    cacheBytes: SOURCE_CACHE_BYTES,
    // תצוגת דיווח בלבד; אישור ופרסום תמיד קוראים את ה-head העדכני.
    sourceHeadTtlMs: SOURCE_HEAD_TTL_SECONDS * 1000,
    // שורות הקשר לפני ואחרי השורה ב-diff (תצוגה ובקשת השירות).
    diffContextLines: DIFF_CONTEXT_LINES,
  };
}

/** תיאור בטוח להצגה (בלי סודות). */
export function describeConfig(cfg) {
  return {
    production: cfg.production,
    errors: cfg.errors,
    // המתגים האלה נערכים במסך הניהול; השאר מגיע מ-env או קבוע בקוד.
    runtimeSwitches: RUNTIME_SWITCHES,
    intakeEnabled: cfg.intakeEnabled,
    verifyPaused: cfg.verifyPaused,
    verify: {
      enabled: cfg.verify.enabled,
      disabledReason: cfg.verify.disabledReason,
      transport: cfg.verify.transport,
      agentId: cfg.verify.transport === 'pull' ? cfg.verify.agentId || null : null,
      agentSecretConfigured: Boolean(cfg.verify.agentSecret),
      deadlineHours: cfg.verify.transport === 'pull' ? cfg.verify.deadlineHours : null,
      urlHost: cfg.verify.url ? new URL(cfg.verify.url).host : null,
      secretConfigured: Boolean(cfg.verify.secret),
      isMock: cfg.verify.isMock,
      authority: cfg.verify.authority,
      requestedScope: cfg.verify.requestedScope,
      autoRejectAllowed: cfg.verify.autoRejectAllowed,
      maxAttempts: cfg.verify.maxAttempts,
      maxTotalSeconds: cfg.verify.maxTotalSeconds,
    },
    autoPublish: cfg.autoPublish,
    publish: {
      mode: cfg.publish.mode,
      requestedMode: cfg.publish.requestedMode,
      disabledReason: cfg.publish.disabledReason,
      repo: cfg.publish.repo,
      branch: cfg.publish.branch,
      tokenConfigured: Boolean(cfg.publish.token),
    },
    source: { repo: cfg.source.repo, ref: cfg.source.ref },
  };
}
