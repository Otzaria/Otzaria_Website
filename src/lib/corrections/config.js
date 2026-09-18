/**
 * הגדרות מערכת תיקוני הטקסט. סודות וכתובות השירות מ-env בלבד; מתגי ההתנהגות
 * (קליטה, מצב פרסום, פרסום אוטומטי, השהיית השירות) מגיעים מ-SystemConfig דרך מסך הניהול.
 */
import { DEFAULT_DIFF_CONTEXT_LINES } from './unified-diff.js';

export const AUTHORITY = Object.freeze({ NONE: 'none', TECHNICAL_ONLY: 'technical_only', FULL: 'technical_and_content' });
export const PUBLISH_MODES = Object.freeze(['disabled', 'pr', 'direct']);

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
export const WORKER_BATCH_SIZE = 10;
export const WORKER_CONCURRENCY = 2;
export const JOB_LEASE_SECONDS = 120;
// חייב לכסות מחזור cron שלם (10 דקות) ועוד מרווח, אחרת הבריאות תתריע בין הרצה להרצה.
export const HEARTBEAT_STALE_SECONDS = 900;
export const MANUAL_CLAIM_MINUTES = 120;
export const SOURCE_CACHE_BYTES = 64 * 1024 * 1024;
export const SOURCE_HEAD_TTL_SECONDS = 30;
export const DIFF_CONTEXT_LINES = DEFAULT_DIFF_CONTEXT_LINES;

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

  if (!verifyRequested) verifyDisabledReason = 'service_disabled';
  else if (!rawUrl) verifyDisabledReason = 'service_not_configured';
  else if (!verifyUrl) verifyDisabledReason = 'service_misconfigured';
  else if (!secret) verifyDisabledReason = 'service_secret_missing';
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
  const token = (env.DICTA_LIBRARY_GITHUB_TOKEN || '').trim();
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
      url: verifyUrl,
      secret,
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
    },
    source: { repo: SOURCE_REPO, ref: SOURCE_REF, token },
    worker: {
      batchSize: WORKER_BATCH_SIZE,
      concurrency: WORKER_CONCURRENCY,
      leaseSeconds: JOB_LEASE_SECONDS,
      staleHeartbeatSeconds: HEARTBEAT_STALE_SECONDS,
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
