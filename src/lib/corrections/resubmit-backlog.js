/**
 * שליחת התור הידני הישן לשירות הבדיקה (scripts/resubmit-corrections-backlog.mjs). דיווח שנכנס לתור הידני כשהשירות
 * היה כבוי אינו חוזר אליו מעצמו: הדרך היחידה היא "שליחה מחודשת לשירות" (resubmitToService ב-volunteer.js), שדורשת
 * מתנדב שמחזיק בדיווח. כאן אותו עדכון בדיוק (resubmitToServiceUpdate), בלי מתנדב, לדיווחים פנויים שלא אושרו ושיש להם
 * הצעה: מעבר מותנה אחד לכל דיווח — ב-generation שנקרא ובכל תנאי הבחירה — כך שדיווח שמתנדב לקח בינתיים נשאר כמו שהוא.
 * אינו מריץ אצווה: תפיסת השירות (claimVerifyJob ב-agent.js) יוצרת את משימות הבדיקה מה-outbox בכל פנייה.
 */
import { openSync, writeSync, closeSync } from 'node:fs';
import ErrorReport from '../../models/ErrorReport.js';
import { shabbatGate } from '../shabbat-cache.js';
import { computeNewLine } from './payload.js';
import { currentRevisionOf, logEvent, resubmitToServiceUpdate } from './store.js';
import { PUBLISHING_STATUSES } from './listFilters.js';
import { HANDOFF_REASON_LABELS } from './states.js';
import { loadCorrectionsConfig } from './runtime.js';
import { restGate } from './rest-gate.js';

export const BACKLOG_SCRIPT = 'resubmit-corrections-backlog';
// כמו ב-migration: היומן מציג את הפעולה בשם "סקריפט תחזוקה".
export const BACKLOG_ACTOR = Object.freeze({ kind: 'system' });
export const EXIT = Object.freeze({ OK: 0, ERRORS: 1, USAGE: 2, REFUSED: 3 });

const SAMPLE_IDS = 5;
const MAX_LIMIT = 100_000;
// אותו פורמט כמו סינון הרשימה לפי סיבה (listReports ב-volunteer.js).
const REASON_RE = /^[a-z_:]{1,60}$/;
const FIELDS = '_id workflowGeneration currentRevision proposals manual.status manual.handoffReason verification.status createdAt';
const NO_REASON = '(none)';

/**
 * תנאי הבחירה במסד — וגם תנאי הכתיבה של כל דיווח. פתוח (לא email_only), בתור הידני או ששוחרר בלי מטפל, לא אושר,
 * לא בדרך לשירות, ולא באף שלב של פרסום: כמו בלשונית "פנויים" (queuedFilter) — כולל כשל פרסום, שבו נמצאים גם דיווחים
 * שה-PR שלהם נסגר בלי מיזוג, בעוד שהממתינים לקליטה ב-main הם pr_opened.
 * @param {{reasons?:string[]}} [opts] reasons — manual.handoffReason (אחד מהם)
 */
export function backlogFilter({ reasons = [] } = {}) {
  return {
    state: 'open',
    'manual.status': { $in: ['queued', 'released'] },
    'manual.assignee': null,
    'approval.authority': 'none',
    'publish.status': { $nin: [...PUBLISHING_STATUSES, 'failed'] },
    'verification.status': { $nin: ['queued', 'in_progress'] },
    'dispatch.verify': { $ne: true },
    ...(reasons.length ? { 'manual.handoffReason': { $in: [...reasons] } } : {}),
  };
}

/**
 * ההצעה הנוכחית (אותם עזרים כמו ב-resubmitToService): 'ok' — שורה מוצעת; 'no_proposal' — אין הצעה (דיווח ישן או
 * חופשי); 'structural_change' — שורה מוצעת עם ירידת שורה, שגם בקליטה אינה נשלחת לשירות (planIntakeRouting) והמפרסם
 * דוחה ממילא.
 */
export function proposalStatus(r) {
  const line = computeNewLine(currentRevisionOf(r));
  if (line === null) return 'no_proposal';
  return /[\r\n]/.test(line) ? 'structural_change' : 'ok';
}

const countBy = (items, keyOf) => {
  const m = new Map();
  for (const it of items) {
    const k = keyOf(it) ?? NO_REASON;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Object.fromEntries(m);
};

/**
 * בחירה (תמיד) ושליחה מחודשת (רק עם apply), הוותיקים קודם.
 * @param {object} args
 * @param {object} args.config הגדרות התיקונים (loadCorrectionsConfig) — requestedScope של הבקשה החדשה
 * @param {boolean} [args.apply]
 * @param {number|null} [args.limit] כמה דיווחים לכל היותר בהרצה הזו
 * @param {string[]} [args.reasons] רק דיווחים שסיבת ההעברה שלהם אחת מאלה
 * @param {() => (boolean|Promise<boolean>)} [args.isRestClosed] נבדק לפני כל כתיבה: שבת/יו"ט שהתחילו באמצע עוצרים
 * @param {(row:object) => void} [args.onRequeued] שורה לכל דיווח שנשלח (--log); חריגה עוצרת את ההרצה
 * @param {{beforeWrite?:Function}} [args.hooks] לבדיקות בלבד
 */
export async function resubmitBacklog({ config, apply = false, limit = null, reasons = [], isRestClosed = null, onRequeued = null, hooks = {} }) {
  const filter = backlogFilter({ reasons });
  const found = await ErrorReport.find(filter).select(FIELDS).sort({ createdAt: 1, _id: 1 }).lean();
  const status = new Map(found.map((r) => [r, proposalStatus(r)]));
  const eligible = found.filter((r) => status.get(r) === 'ok');
  const selected = limit ? eligible.slice(0, limit) : eligible;
  const result = {
    apply,
    candidates: found.length,
    skipped: {
      noProposal: found.filter((r) => status.get(r) === 'no_proposal').length,
      structuralChange: found.filter((r) => status.get(r) === 'structural_change').length,
    },
    eligible: eligible.length,
    selected: selected.length,
    byHandoffReason: countBy(selected, (r) => r.manual?.handoffReason),
    byVerificationStatus: countBy(selected, (r) => r.verification?.status),
    sampleIds: selected.slice(0, SAMPLE_IDS).map((r) => String(r._id)),
    requeued: 0,
    raced: 0,
    errors: 0,
    errorSamples: [],
    stoppedForShabbat: false,
    logFailed: null,
  };
  if (!apply) return result;

  for (const r of selected) {
    let closed;
    try {
      closed = isRestClosed ? await isRestClosed() : false;
    } catch {
      closed = true; // נכשל-סגור, כמו שער השבת של השירות
    }
    if (closed) {
      result.stoppedForShabbat = true;
      break;
    }
    let updated;
    try {
      if (hooks.beforeWrite) await hooks.beforeWrite(r);
      updated = await ErrorReport.findOneAndUpdate(
        // currentRevision: ההצעה שנבדקה למעלה היא זו שתישלח
        { ...filter, _id: r._id, workflowGeneration: r.workflowGeneration, currentRevision: r.currentRevision },
        resubmitToServiceUpdate(config),
        { returnDocument: 'after' },
      ).lean();
    } catch (err) {
      result.errors += 1;
      if (result.errorSamples.length < 5) result.errorSamples.push({ id: String(r._id), error: String(err?.message || err).slice(0, 120) });
      continue;
    }
    if (!updated) {
      result.raced += 1;
      continue;
    }
    result.requeued += 1;
    const row = {
      id: String(r._id), fromGeneration: r.workflowGeneration, toGeneration: updated.workflowGeneration,
      handoffReason: r.manual?.handoffReason ?? null, requestId: updated.verification.requestId,
    };
    await logEvent(updated._id, 'resubmitted_to_service', BACKLOG_ACTOR, updated.workflowGeneration, {
      requestId: row.requestId, script: BACKLOG_SCRIPT, fromGeneration: row.fromGeneration, handoffReason: row.handoffReason,
      manualStatus: r.manual?.status ?? null, verificationStatus: r.verification?.status ?? null,
    });
    if (onRequeued) {
      try {
        onRequeued(row);
      } catch (err) {
        // בלי יומן מלא לא ממשיכים: מה שכבר נשלח מתועד גם ב-CorrectionEvent (data.script).
        result.logFailed = String(err?.message || err).slice(0, 200);
        break;
      }
    }
  }
  return result;
}

/**
 * שער שבת/יו"ט של הסקריפט: סגור אם אחד מהשניים סגור — חלונות המנוחה של שירות הבדיקה (rest-gate.js: אופליין ונכשל-סגור,
 * משישי/ערב חג 12:00 עד מוצאי שבת/חג 22:00) ושער האתר, שגם ה-worker מושהה לפיו (shabbat-cache.js, מול Hebcal).
 */
export async function restClosed({ now = new Date(), gate = restGate, hebcal = shabbatGate } = {}) {
  if (gate(now).closed) return true;
  try {
    return (await hebcal.isAssurBemlacha()) === true;
  } catch {
    return true;
  }
}

/** סיבה לסרב ל---apply לפי ההגדרות של האתר עצמו, או null. */
export function applyRefusal(config) {
  const v = config.verify;
  if (!v.enabled) {
    const label = HANDOFF_REASON_LABELS[v.disabledReason];
    return { code: v.disabledReason || 'service_disabled', message: `שירות הבדיקה אינו פעיל (${v.disabledReason}${label ? ` — ${label}` : ''}): דיווח שיישלח עכשיו יחזור מיד לתור הידני.` };
  }
  if (v.transport !== 'pull') {
    return { code: 'not_pull', message: `שירות הבדיקה אינו במצב משיכה (CORRECTIONS_VERIFY_TRANSPORT=${v.transport}); הסקריפט מיועד למצב משיכה בלבד.` };
  }
  return null;
}

export const USAGE = [
  'שימוש: node scripts/resubmit-corrections-backlog.mjs [--apply] [--limit N] [--reason <manual.handoffReason>]... [--log <file.jsonl>]',
  '  בלי --apply: dry-run — ספירות לפי סיבת ההעברה ומצב הבדיקה, ומזהים לדוגמה.',
  '  --limit N   לכל היותר N דיווחים (הוותיקים קודם)',
  '  --reason R  רק דיווחים שסיבת ההעברה שלהם R (אפשר כמה פעמים)',
  '  --log F     עם --apply: שורת JSON לכל דיווח שנשלח (נוספת לסוף הקובץ)',
].join('\n');

/** @returns {{apply:boolean, limit:(number|null), reasons:string[], logPath:(string|null), help:boolean} | {error:string}} */
export function parseBacklogArgs(argv) {
  const opts = { apply: false, limit: null, reasons: [], logPath: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i]);
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const name = eq === -1 ? raw : raw.slice(0, eq);
    const inline = eq === -1 ? undefined : raw.slice(eq + 1);
    const value = () => (inline !== undefined ? inline : argv[++i]);
    switch (name) {
      case '--apply':
      case '--help':
      case '-h':
        if (inline !== undefined) return { error: `${name} אינו מקבל ערך` };
        if (name === '--apply') opts.apply = true;
        else opts.help = true;
        break;
      case '--limit': {
        const v = value();
        if (!/^\d{1,6}$/.test(v ?? '') || Number(v) < 1 || Number(v) > MAX_LIMIT) return { error: `--limit דורש מספר שלם בין 1 ל-${MAX_LIMIT}` };
        opts.limit = Number(v);
        break;
      }
      case '--reason': {
        const v = value();
        if (!REASON_RE.test(v ?? '')) return { error: '--reason דורש קוד סיבת העברה (manual.handoffReason), למשל service_disabled' };
        if (!opts.reasons.includes(v)) opts.reasons.push(v);
        break;
      }
      case '--log': {
        const v = value();
        if (!v || v.startsWith('-')) return { error: '--log דורש נתיב קובץ' };
        opts.logPath = v;
        break;
      }
      default:
        return { error: `ארגומנט לא מוכר: ${raw}` };
    }
  }
  return opts;
}

/**
 * הסקריפט עצמו (הקובץ ב-scripts רק מחבר את המסד): ארגומנטים → שער שבת → הגדרות → בחירה/שליחה → סיכום.
 * @param {string[]} argv
 * @param {object} [deps] connect/disconnect, ולבדיקות: env, loadConfig, isRestClosed, out, err
 * @returns {Promise<number>} קוד היציאה (EXIT)
 */
export async function runResubmitBacklogCli(argv, deps = {}) {
  const out = deps.out || ((s) => console.log(s));
  const errOut = deps.err || ((s) => console.error(s));
  const opts = parseBacklogArgs(argv);
  if (opts.error) {
    errOut(opts.error);
    errOut(USAGE);
    return EXIT.USAGE;
  }
  if (opts.help) {
    out(USAGE);
    return EXIT.OK;
  }
  const isRestClosed = async () => {
    try {
      return Boolean(await (deps.isRestClosed || (() => restClosed()))());
    } catch {
      return true;
    }
  };
  // לפני כל גישה למסד, גם ב-dry-run: בשבת/יו"ט האתר סגור וה-worker מושהה.
  if (await isRestClosed()) {
    errOut('שבת/יום טוב (חלון המנוחה של האתר: משישי/ערב חג 12:00 עד מוצאי שבת/חג 22:00, או לפי Hebcal) — הסקריפט אינו רץ. יש להריץ אחרי סוף החלון.');
    return EXIT.REFUSED;
  }
  for (const reason of opts.reasons) {
    if (!Object.hasOwn(HANDOFF_REASON_LABELS, reason)) errOut(`אזהרה: "${reason}" אינה סיבת העברה מוכרת (states.js).`);
  }

  if (deps.connect) await deps.connect();
  let fd = null;
  let logLines = 0;
  try {
    const config = await (deps.loadConfig || loadCorrectionsConfig)(deps.env || process.env);
    const refusal = applyRefusal(config);
    if (opts.apply && refusal) {
      errOut(`--apply סורב: ${refusal.message}`);
      return EXIT.REFUSED;
    }
    if (opts.apply && opts.logPath) {
      try {
        fd = openSync(opts.logPath, 'a');
      } catch (err) {
        errOut(`לא ניתן לפתוח את קובץ היומן ${opts.logPath}: ${err?.code || err?.message}`);
        return EXIT.USAGE;
      }
    }
    const onRequeued = fd === null ? null : (row) => {
      writeSync(fd, `${JSON.stringify({ ...row, at: new Date().toISOString() })}\n`);
      logLines += 1;
    };
    const result = await resubmitBacklog({
      config, apply: opts.apply, limit: opts.limit, reasons: opts.reasons, isRestClosed: opts.apply ? isRestClosed : null, onRequeued,
    });
    const { apply, ...counts } = result;
    out(JSON.stringify({
      apply,
      verify: { enabled: config.verify.enabled, disabledReason: config.verify.disabledReason, transport: config.verify.transport, requestedScope: config.verify.requestedScope },
      applyAllowed: !refusal,
      filters: { reasons: opts.reasons, limit: opts.limit },
      ...counts,
    }, null, 2));

    if (!opts.apply) {
      if (refusal) errOut(`אזהרה: --apply יסורב כעת — ${refusal.message}`);
      if (opts.logPath) out('--log נכתב רק עם --apply.');
      out('dry-run בלבד. להחלה: --apply');
      return EXIT.OK;
    }
    out(`נשלחו מחדש לשירות ${result.requeued} דיווחים. אין צורך להריץ אצווה של ה-worker: תפיסת שירות הבדיקה יוצרת את משימות הבדיקה מה-outbox`
      + ` בכל פנייה (עד 50 בכל פעם), ומועד המיצוי (${config.verify.deadlineHours} שעות בלי שבת/יו"ט) נספר מיצירת המשימה.`);
    if (fd !== null) out(`יומן: ${opts.logPath} (${logLines} שורות)`);
    if (result.raced) out(`${result.raced} דיווחים השתנו בין הקריאה לכתיבה (למשל מתנדב לקח אותם) — לא נגעו בהם.`);
    if (result.logFailed) errOut(`הכתיבה ליומן נכשלה (${result.logFailed}) וההרצה נעצרה; מה שנשלח מתועד ביומן הדיווח (data.script).`);
    if (result.errors) errOut(`${result.errors} דיווחים לא נשלחו בגלל שגיאות — הרצה חוזרת משלימה אותם.`);
    if (result.stoppedForShabbat) {
      errOut('ההרצה נעצרה: התחיל חלון שבת/יום טוב. הרצה חוזרת אחרי סוף החלון ממשיכה מאותו מקום.');
      return EXIT.REFUSED;
    }
    return result.errors || result.logFailed ? EXIT.ERRORS : EXIT.OK;
  } finally {
    if (fd !== null) closeSync(fd);
    if (deps.disconnect) await deps.disconnect();
  }
}
