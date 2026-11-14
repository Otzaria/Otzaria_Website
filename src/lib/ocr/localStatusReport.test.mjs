import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_MESSAGE_CHARS,
  REPORTABLE_STATUSES,
  STORED_MESSAGE_CHARS,
  STORED_PHASE_CHARS,
  marksStarted,
  statusUpdateFilter,
  statusUpdateSet,
  validateStatusReport,
} from './localStatusReport.js';
import { REPORT_STATES, TERMINAL_STATUSES, WORKER_VISIBLE_STATUSES } from './localJobState.js';

// contracts/examples/status-report*.json בריפו השירות (הועתקו — הריפו אינו זמין ב-CI)
const EXAMPLE_RUNNING = {"workerId":"worker-1","state":"running","progress":{"phase":"recognize","pagesDone":1,"pagesTotal":2},"reportSeq":7,"attempt":1,"message":"recognizing"};
const EXAMPLE_ATTENTION = {"workerId":"worker-1","state":"needs_attention","progress":{"phase":"needs_attention","pagesDone":0,"pagesTotal":2},"reportSeq":9,"attempt":1,"message":"device_missing: the required AMD GPU is not available to the worker"};

// הטקסטים הקבועים של StatusReporter.AttentionText בשירות — כל אחד חייב להתקבל
const ATTENTION_TEXTS = {
  manifest_conflict: 'the site sent different immutable data (options, pageMap or input hash) for this job; the original is kept',
  jobid_case_conflict: 'the site sent this jobId in another letter case',
  device_missing: 'the required AMD GPU is not available to the worker',
  pipeline_misconfigured: 'the OCR pipeline on the worker is not installed or configured correctly',
  process_tree_alive: 'an earlier OCR process on the worker did not exit',
  crash_loop: 'the worker service was interrupted too many times during this job',
  input_hash_mismatch: 'the downloaded PDF does not match inputSha256',
  input_unavailable: 'the site refused the PDF download',
  delivery_rejected: 'the site rejected the result; it is kept on the worker',
  result_conflict: "the site holds a different result for this job (409); the worker's result is kept",
  invalid_ack: "the site's answer to the result was not a valid acknowledgement; the result is kept",
  output_missing: "the worker's frozen result file is missing",
  output_corrupt: "the worker's frozen result file changed on disk",
  output_unknown: 'the worker has no frozen result recorded for this job',
  output_path_invalid: "the worker's result path is invalid",
};

const base = (over = {}) => ({ ...structuredClone(EXAMPLE_RUNNING), ...over });
const field = (body) => {
  const r = validateStatusReport(body);
  assert.equal(r.ok, false, JSON.stringify(body));
  return r.field ?? r.error;
};

test('דוגמאות החוזה מתקבלות כמו שהן', () => {
  assert.deepEqual(validateStatusReport(EXAMPLE_RUNNING), {
    ok: true,
    report: { workerId: 'worker-1', state: 'running', phase: 'recognize', pagesDone: 1, pagesTotal: 2, reportSeq: 7, attempt: 1, message: 'recognizing' },
  });
  const att = validateStatusReport(EXAMPLE_ATTENTION);
  assert.equal(att.ok, true);
  assert.equal(att.report.message, EXAMPLE_ATTENTION.message);
  assert.equal(att.report.state, 'needs_attention');
});

test('כל תשעת ערכי state מתקבלים; כל הודעות needs_attention של השירות, קוד חשוף ו-unknown מתקבלים', () => {
  for (const state of REPORT_STATES) assert.equal(validateStatusReport(base({ state })).ok, true, state);
  for (const [reason, text] of Object.entries(ATTENTION_TEXTS)) {
    const r = validateStatusReport(base({ state: 'needs_attention', message: `${reason}: ${text}` }));
    assert.equal(r.ok, true, reason);
  }
  for (const message of ['unknown', 'some_new_code_2', 'x']) assert.equal(validateStatusReport(base({ state: 'needs_attention', message })).ok, true, message);
});

test('שדות אופציונליים: message ו-phase חסרים או null (השירות משמיט null)', () => {
  const { message: _m, ...noMessage } = base();
  assert.equal(validateStatusReport(noMessage).report.message, null);
  assert.equal(validateStatusReport(base({ message: null })).report.message, null);
  const noPhase = base({ progress: { pagesDone: 0, pagesTotal: 0 } });
  assert.equal(validateStatusReport(noPhase).report.phase, null);
  assert.equal(validateStatusReport(base({ progress: { phase: null, pagesDone: 0, pagesTotal: 0 } })).report.phase, null);
  // שדות לא מוכרים — מתעלמים (כמו UnmappedMemberHandling.Skip בשירות)
  assert.equal(validateStatusReport(base({ extra: 1 })).ok, true);
});

test('גוף שאינו אובייקט JSON → 400 bad_request', () => {
  for (const body of [null, [], 'x', 5, true, undefined]) {
    assert.deepEqual(validateStatusReport(body), { ok: false, status: 400, error: 'bad_request' });
  }
});

test('כל שדה חסר או שגוי → 422 invalid_report עם שם השדה', () => {
  const drop = (k) => {
    const b = base();
    delete b[k];
    return b;
  };
  for (const k of ['workerId', 'state', 'progress', 'reportSeq', 'attempt']) assert.equal(field(drop(k)), k);
  assert.deepEqual(validateStatusReport(drop('state')), { ok: false, status: 422, error: 'invalid_report', field: 'state' });

  for (const workerId of ['', 5, null, 'w'.repeat(257)]) assert.equal(field(base({ workerId })), 'workerId');
  for (const state of ['Running', 'RUNNING', 'paused', 'closed', 'in_progress', '', 1, null, ['running'], 'running, failed']) {
    assert.equal(field(base({ state })), 'state', String(state));
  }
  for (const progress of [null, [], 'x', 3]) assert.equal(field(base({ progress })), 'progress');
  for (const pagesDone of [-1, 1.5, '1', null, undefined, Number.NaN, 2 ** 53]) {
    assert.equal(field(base({ progress: { pagesDone, pagesTotal: 2 } })), 'progress.pagesDone', String(pagesDone));
  }
  for (const pagesTotal of [-1, 0.5, '2', null]) assert.equal(field(base({ progress: { pagesDone: 0, pagesTotal } })), 'progress.pagesTotal');
  for (const phase of [5, {}, 'p'.repeat(1001)]) assert.equal(field(base({ progress: { phase, pagesDone: 0, pagesTotal: 0 } })), 'progress.phase');
  for (const reportSeq of [0, -1, 1.5, '7', null, Number.MAX_SAFE_INTEGER + 2]) assert.equal(field(base({ reportSeq })), 'reportSeq', String(reportSeq));
  for (const attempt of [-1, 0.5, '1', null]) assert.equal(field(base({ attempt })), 'attempt');
});

test('message: רק "<reason>: <fixed text>" ב-ASCII מודפס, עד 1000 תווים', () => {
  const bad = [
    5,
    '',
    'Device_Missing: x', // רישיות
    'device missing: x', // רווח בקוד
    'device_missing:x', // בלי רווח אחרי הנקודתיים
    'device_missing: ', // טקסט ריק
    'device_missing: line1\nline2', // שורה חדשה
    'device_missing: tab\there',
    'device_missing: \u202eevil', // תו כיווניות
    'device_missing: נתיב בעברית',
    'C:\\Users\\x: failed', // נתיב מקומי בתור קוד
    'System.IO.IOException: boom',
    `${'a'.repeat(65)}: x`, // קוד ארוך מ-64
    `device_missing: ${'x'.repeat(MAX_MESSAGE_CHARS)}`, // ארוך מהתקרה
  ];
  for (const message of bad) assert.equal(field(base({ state: 'needs_attention', message })), 'message', JSON.stringify(message));
  // בדיוק בתקרה — מתקבל ונשמר חתוך
  const long = `device_missing: ${'x'.repeat(MAX_MESSAGE_CHARS - 16)}`;
  assert.equal(long.length, MAX_MESSAGE_CHARS);
  const r = validateStatusReport(base({ state: 'needs_attention', message: long }));
  assert.equal(r.ok, true);
  assert.equal(r.report.message, long.slice(0, STORED_MESSAGE_CHARS));
});

test('phase: טקסט חופשי — תווי בקרה/כיווניות מוסרים ונשמר חתוך ל-64', () => {
  const r = validateStatusReport(base({ progress: { phase: `rec\u0000og\u202enize${'x'.repeat(100)}`, pagesDone: 0, pagesTotal: 1 } }));
  assert.equal(r.ok, true);
  assert.equal(r.report.phase.length, STORED_PHASE_CHARS);
  assert.ok(r.report.phase.startsWith('recognize'));
});

test('phase: כל תווי Bidi_Control (כולל ALM U+061C) ומפרידי שורה/פסקה מוסרים', () => {
  const bidi = '\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u2028\u2029';
  const r = validateStatusReport(base({ progress: { phase: `re${bidi}cog`, pagesDone: 0, pagesTotal: 1 } }));
  assert.equal(r.report.phase, 'recog');
  // כל תו Bidi_Control לפי טבלאות Unicode של המנוע — מוסר
  const all = [];
  for (let c = 0; c <= 0xffff; c++) if (/\p{Bidi_Control}/u.test(String.fromCharCode(c))) all.push(String.fromCharCode(c));
  assert.ok(all.length >= 12);
  assert.equal(validateStatusReport(base({ progress: { phase: `a${all.join('')}b`, pagesDone: 0, pagesTotal: 1 } })).report.phase, 'ab');
});

test('phase: הקיצור לפי נקודות קוד — לא חוצה זוג surrogate (בלי חצי תו בסוף)', () => {
  const r = validateStatusReport(base({ progress: { phase: `${'x'.repeat(STORED_PHASE_CHARS - 1)}\u{1F600}tail`, pagesDone: 0, pagesTotal: 1 } }));
  assert.equal(r.report.phase, `${'x'.repeat(STORED_PHASE_CHARS - 1)}\u{1F600}`);
  assert.equal(r.report.phase.isWellFormed(), true);
});

test('statusUpdateFilter: עבודה של העובד, פעילה, בלי החלטה, בסטטוס מדווח, reportSeq קטן מהנכנס', () => {
  assert.deepEqual(statusUpdateFilter('abc', 'worker-1', 7), {
    _id: 'abc',
    method: 'local',
    workerId: 'worker-1',
    inputSha256: { $type: 'string' },
    active: true,
    decision: null,
    status: { $in: REPORTABLE_STATUSES },
    reportSeq: { $not: { $gte: 7 } },
  });
  // applying (החלת תוצאה), preparing וסופיים — לא מתעדכנים מדיווח
  assert.deepEqual([...REPORTABLE_STATUSES], WORKER_VISIBLE_STATUSES.filter((s) => s !== 'applying'));
  for (const s of [...TERMINAL_STATUSES, 'applying', 'preparing']) assert.ok(!REPORTABLE_STATUSES.includes(s), s);
});

test('statusUpdateSet: מצב פעיל ממופה ל-status; completed/failed/cancelled לא משנים status', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const { report } = validateStatusReport(EXAMPLE_RUNNING);
  assert.deepEqual(statusUpdateSet(report, now), {
    reportSeq: 7,
    workerState: 'running',
    attempt: 1,
    progressPhase: 'recognize',
    processedPages: 1,
    progressPagesTotal: 2,
    workerMessage: 'recognizing',
    lastSeenAt: now,
    status: 'running',
  });
  for (const state of ['queued', 'pausing', 'paused_runner', 'delivery_pending', 'needs_attention']) {
    assert.equal(statusUpdateSet({ ...report, state }, now).status, state);
  }
  for (const state of ['completed', 'failed', 'cancelled']) {
    const set = statusUpdateSet({ ...report, state }, now);
    assert.equal(Object.hasOwn(set, 'status'), false, state);
    assert.equal(set.workerState, state);
  }
  // בלי message/phase → מתאפסים (יציאה מ-needs_attention מנקה את ההודעה הקודמת)
  const cleared = statusUpdateSet({ ...report, message: null, phase: null }, now);
  assert.equal(cleared.workerMessage, '');
  assert.equal(cleared.progressPhase, '');
});

test('marksStarted: רק מצבים שאומרים שהעיבוד התחיל', () => {
  for (const s of ['running', 'pausing', 'paused_runner', 'delivery_pending']) assert.equal(marksStarted(s), true, s);
  for (const s of ['queued', 'needs_attention', 'completed', 'failed', 'cancelled']) assert.equal(marksStarted(s), false, s);
});
