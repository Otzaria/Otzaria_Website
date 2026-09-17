/**
 * הגדרות מערכת תיקוני הטקסט. ההגדרות הבטיחותיות (סוד, כתובת, סמכות, פרסום
 * אוטומטי, מצב פרסום, יעד) נקראות מ-env בלבד; מתג החירום בזמן ריצה יכול רק לכבות.
 */
import { DEFAULT_DIFF_CONTEXT_LINES, MAX_DIFF_CONTEXT_LINES } from './unified-diff.js';

export const AUTHORITY = Object.freeze({ NONE: 'none', TECHNICAL_ONLY: 'technical_only', FULL: 'technical_and_content' });
export const PUBLISH_MODES = Object.freeze(['disabled', 'pr', 'direct']);

const bool = (v, dflt) => {
  if (v === undefined || v === null || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
};
const int = (v, dflt, min, max) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
};
const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_RE = /^(?!.*\.\.)(?!\/)[A-Za-z0-9_./-]{1,200}(?<!\/)$/;

function isLocalHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h) || h === '0.0.0.0';
}

/**
 * @param {Record<string,string|undefined>} env
 * @param {{verifyPaused?: boolean}} [runtime] מתג החירום מ-SystemConfig (אופציונלי)
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
  // ברירת מחדל: הטוקן שמרחב עריכת הספרים כבר דוחף בו. פרסום עדיין דורש repo+branch מפורשים.
  const token = env.CORRECTIONS_GITHUB_TOKEN || env.DICTA_LIBRARY_GITHUB_TOKEN || '';
  const repo = (env.CORRECTIONS_GITHUB_REPO || '').trim();
  const branch = (env.CORRECTIONS_GITHUB_BRANCH || '').trim();
  let publishMode = (env.CORRECTIONS_PUBLISH_MODE || '').trim() || (token ? 'pr' : 'disabled');
  if (!PUBLISH_MODES.includes(publishMode)) {
    errors.push('CORRECTIONS_PUBLISH_MODE invalid');
    publishMode = 'disabled';
  }
  let publishDisabledReason = null;
  if (publishMode === 'disabled') publishDisabledReason = 'publish_disabled';
  else if (!token) publishDisabledReason = 'publish_token_missing';
  else if (!REPO_RE.test(repo)) publishDisabledReason = 'publish_target_not_configured';
  else if (!BRANCH_RE.test(branch)) publishDisabledReason = 'publish_target_not_configured';
  else if (publishMode === 'direct' && !bool(env.CORRECTIONS_ALLOW_DIRECT_COMMIT, false)) publishDisabledReason = 'direct_commit_not_authorized';
  if (publishDisabledReason && publishDisabledReason !== 'publish_disabled') errors.push(`publish: ${publishDisabledReason}`);

  const sourceRepo = (env.CORRECTIONS_SOURCE_REPO || 'Otzaria/otzaria-library').trim();
  const sourceRef = (env.CORRECTIONS_SOURCE_REF || 'main').trim();
  if (!REPO_RE.test(sourceRepo) || !BRANCH_RE.test(sourceRef)) errors.push('CORRECTIONS_SOURCE_REPO/REF invalid');

  const autoPublishRequested = bool(env.CORRECTIONS_AUTO_PUBLISH, false);

  return {
    production,
    errors,
    intakeEnabled: bool(env.CORRECTIONS_INTAKE_ENABLED, true),
    verify: {
      enabled: verifyDisabledReason === null,
      disabledReason: verifyDisabledReason,
      url: verifyUrl,
      secret,
      isMock,
      authority: verifyDisabledReason === null ? authority : AUTHORITY.NONE,
      requestedScope,
      autoRejectAllowed: bool(env.CORRECTIONS_VERIFY_AUTO_REJECT, false) && !(production && isMock),
      maxAttempts: int(env.CORRECTIONS_VERIFY_MAX_ATTEMPTS, 6, 1, 50),
      maxTotalSeconds: int(env.CORRECTIONS_VERIFY_MAX_TOTAL_SECONDS, 86_400, 60, 30 * 86_400),
      timeoutMs: int(env.CORRECTIONS_VERIFY_TIMEOUT_MS, 20_000, 1_000, 120_000),
      backoffBaseSeconds: int(env.CORRECTIONS_VERIFY_BACKOFF_BASE_SECONDS, 30, 1, 3_600),
      backoffCapSeconds: int(env.CORRECTIONS_VERIFY_BACKOFF_CAP_SECONDS, 3_600, 1, 86_400),
    },
    autoPublish: autoPublishRequested && !(production && isMock),
    publish: {
      mode: publishDisabledReason ? 'disabled' : publishMode,
      requestedMode: publishMode,
      disabledReason: publishDisabledReason,
      repo,
      branch,
      token,
      maxRefRetries: int(env.CORRECTIONS_PUBLISH_MAX_REF_RETRIES, 3, 1, 10),
      maxAttempts: int(env.CORRECTIONS_PUBLISH_MAX_ATTEMPTS, 5, 1, 20),
    },
    source: { repo: sourceRepo, ref: sourceRef, token: env.CORRECTIONS_SOURCE_TOKEN || token || '' },
    worker: {
      batchSize: int(env.CORRECTIONS_WORKER_BATCH, 10, 1, 100),
      concurrency: int(env.CORRECTIONS_WORKER_CONCURRENCY, 2, 1, 10),
      leaseSeconds: int(env.CORRECTIONS_JOB_LEASE_SECONDS, 120, 10, 3_600),
      staleHeartbeatSeconds: int(env.CORRECTIONS_HEARTBEAT_STALE_SECONDS, 300, 30, 86_400),
    },
    manual: {
      claimMinutes: int(env.CORRECTIONS_CLAIM_MINUTES, 120, 5, 7 * 24 * 60),
    },
    cacheBytes: int(env.CORRECTIONS_SOURCE_CACHE_BYTES, 64 * 1024 * 1024, 1024 * 1024, 1024 * 1024 * 1024),
    // תצוגת דיווח בלבד; אישור ופרסום תמיד קוראים את ה-head העדכני.
    sourceHeadTtlMs: int(env.CORRECTIONS_SOURCE_HEAD_TTL_SECONDS, 30, 0, 600) * 1000,
    // שורות הקשר לפני ואחרי השורה ב-diff (תצוגה ובקשת השירות).
    diffContextLines: int(env.CORRECTIONS_DIFF_CONTEXT_LINES, DEFAULT_DIFF_CONTEXT_LINES, 0, MAX_DIFF_CONTEXT_LINES),
  };
}

/** תיאור בטוח להצגה (בלי סודות). */
export function describeConfig(cfg) {
  return {
    production: cfg.production,
    errors: cfg.errors,
    intakeEnabled: cfg.intakeEnabled,
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
      repo: cfg.publish.repo || null,
      branch: cfg.publish.branch || null,
      tokenConfigured: Boolean(cfg.publish.token),
    },
    source: { repo: cfg.source.repo, ref: cfg.source.ref },
  };
}
