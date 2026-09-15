/**
 * בדיקות הליבה הטהורה של מערכת תיקוני הטקסט. הרצה: npm test
 * כותרת כל בדיקה מתחילה במספר המקרה מרשימת הדרישות ([T..]) כשהיא מכסה מקרה כזה.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canonicalJson, sha256Hex, computeChangeDigest, computeContentDigest, contentDigestInput } from './ocj1.js';
import { validateIntakePayload, computeNewLine } from './payload.js';
import { getCorrectionsConfig } from './config.js';
import { classifyVerifyFailure, computeRetry, parseRetryAfter, describeFetchError } from './classify.js';
import { validateVerifyResponse, routeVerifyDecision, buildVerifyRequest } from './verify-protocol.js';
import { deriveLabels } from './labels.js';
import { planIntakeRouting } from './intake.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(path.join(here, '../../../docs/text-corrections/fixtures/digest_fixtures.json'), 'utf8'));

// ---------------------------------------------------------------- T29 fixtures

for (const c of fixtures.cases) {
  test(`[T29] OCJ-1 fixture ${c.name}: canonical + sha256`, () => {
    const canon = canonicalJson(c.input);
    assert.equal(canon, c.canonical);
    assert.equal(sha256Hex(canon), c.sha256);
    if (c.kind === 'change_digest') assert.equal(computeChangeDigest(c.input), c.sha256);
  });
}

test('[T29] content_digest מגוף בקשה גולמי זהה ל-fixture (כולל null מול "")', () => {
  for (const c of fixtures.cases.filter((x) => x.kind === 'content_digest')) {
    const i = c.input;
    const raw = {
      report_kind: i.report_kind, book_title: i.book_title, current_ref: i.current_ref, location: { line_index: i.line_index },
      selected_text: i.selected_text, error_details: i.error_details, context_text: i.context_text, source_folder: i.source_folder,
      file_path: i.file_path, library_version: i.library_version, correction: i.correction,
      sender_email: 'x@example.com', subject: 'לא נכלל', created_at: '2026-01-01T00:00:00Z',
    };
    assert.equal(computeContentDigest(raw), c.sha256, c.name);
  }
});

test('[T29] OCJ-1 דוחה surrogate בודד, מספר לא שלם ומפתח undefined', () => {
  assert.throws(() => canonicalJson({ a: '\ud800' }));
  assert.throws(() => canonicalJson({ a: 1.5 }));
  assert.throws(() => canonicalJson({ a: undefined }));
  assert.equal(canonicalJson({ b: [1, 'x'], a: null }), '{"a":null,"b":[1,"x"]}');
});

// ---------------------------------------------------------------- payload

const v2 = (over = {}) => {
  const line = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
  const sel = 'אֱלֹהִ֑ים';
  const start = line.indexOf(sel);
  const base = {
    schema_version: 2, report_id: 'r-1', report_kind: 'text_correction',
    book_title: 'בראשית', current_ref: 'בראשית א', selected_text: 'בראשית', error_details: 'הסבר', context_text: '',
    file_path: 'אוצריא/תנך/תורה/בראשית.txt', source_folder: 'ToratEmetToOtzaria', library_version: '27',
    location: { line_index: 2, library_build_id: '27' },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt', repo_path: null },
    correction: {
      original_line: line, original_selection: sel, selection_offset: { unit: 'utf16_code_units', start, end: start + sel.length },
      proposed_text: 'אֱלֹקִ֑ים', context_before: line.slice(0, start), context_after: line.slice(start + sel.length),
    },
  };
  return { ...base, ...over, correction: over.correction === null ? null : { ...base.correction, ...(over.correction || {}) } };
};

test('[T2] הצעת תיקון תקינה מלקוח חדש נקלטת עם השדות המדויקים', () => {
  const r = validateIntakePayload(v2());
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'text_correction');
  assert.equal(computeNewLine(r.correction), '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים');
});

test('[T3] null (לא הוצע) שונה ממחרוזת ריקה (מחיקה) — גם בתוצאה וגם ב-digest', () => {
  const none = validateIntakePayload(v2({ correction: { proposed_text: null } }));
  const del = validateIntakePayload(v2({ correction: { proposed_text: '' } }));
  assert.equal(none.ok, true);
  assert.equal(del.ok, true);
  assert.equal(none.correction.proposedText, null);
  assert.equal(del.correction.proposedText, '');
  assert.equal(computeNewLine(none.correction), null);
  assert.equal(computeNewLine(del.correction), '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א ');
  assert.notEqual(none.contentDigest, del.contentDigest);
});

test('[T4] שדות מדויקים לא מנורמלים: רווחים, HTML, ניקוד ו-NBSP נשמרים כמו שהם', () => {
  const line = '  <b>שָׁלוֹם</b>\u00a0עוֹלָם  ';
  const r = validateIntakePayload(v2({ correction: { original_line: line, original_selection: null, selection_offset: null, proposed_text: '  <b>שָׁלוֹם</b> עוֹלָם  ', context_before: '', context_after: '' } }));
  assert.equal(r.ok, true);
  assert.equal(r.correction.originalLine, line);
  assert.equal(r.correction.proposedText, '  <b>שָׁלוֹם</b> עוֹלָם  ');
});

test('ולידציה: חוסר התאמה בין offset/הקשר לשורה נדחה, הצעה זהה נדחית, חריגה נדחית ולא נחתכת', () => {
  assert.equal(validateIntakePayload(v2({ correction: { selection_offset: { unit: 'utf16_code_units', start: 0, end: 3 } } })).error, 'selection_mismatch');
  assert.equal(validateIntakePayload(v2({ correction: { context_after: 'x' } })).error, 'context_mismatch');
  assert.equal(validateIntakePayload(v2({ correction: { proposed_text: 'אֱלֹהִ֑ים' } })).error, 'proposal_identical');
  const long = validateIntakePayload(v2({ correction: { proposed_text: 'א'.repeat(20_001) } }));
  assert.equal(long.ok, false);
  assert.equal(long.status, 413);
  assert.equal(validateIntakePayload(v2({ schema_version: 3 })).error, 'unsupported_schema_version');
  assert.equal(validateIntakePayload(v2({ content_digest: 'ab'.repeat(32) })).error, 'digest_mismatch');
});

test('[T1] לקוח ישן (בלי schema_version) = free_text; שדות חסרים לא מומצאים', () => {
  const r = validateIntakePayload({ report_id: 'old-1', book_title: 'ספר', error_details: 'טעות', correction: { junk: true } });
  assert.equal(r.ok, true);
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.kind, 'free_text');
  assert.equal(r.correction, null);
  assert.equal(r.location, null);
  assert.equal(contentDigestInput({ report_id: 'old-1' }).line_index, null);
});

test('[T6] digest יציב לאותו תוכן ושונה לתוכן שונה', () => {
  const a = validateIntakePayload(v2());
  const b = validateIntakePayload(v2({ sender_email: 'other@example.com', subject: 'אחר' }));
  const c = validateIntakePayload(v2({ error_details: 'הסבר אחר' }));
  assert.equal(a.contentDigest, b.contentDigest);
  assert.notEqual(a.contentDigest, c.contentDigest);
});

// ---------------------------------------------------------------- config

const baseEnv = {
  NODE_ENV: 'development', CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://127.0.0.1:4555', CORRECTIONS_VERIFY_SECRET: 's3cret',
};

test('[T8] שירות לא מוגדר / כבוי / בלי סוד → מושבת עם סיבה', () => {
  assert.equal(getCorrectionsConfig({}).verify.disabledReason, 'service_disabled');
  assert.equal(getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1' }).verify.disabledReason, 'service_not_configured');
  assert.equal(getCorrectionsConfig({ ...baseEnv, CORRECTIONS_VERIFY_SECRET: '' }).verify.disabledReason, 'service_secret_missing');
  assert.equal(getCorrectionsConfig(baseEnv, { verifyPaused: true }).verify.disabledReason, 'service_paused');
  assert.equal(getCorrectionsConfig(baseEnv).verify.enabled, true);
});

test('[T27] mock מאשר בייצור נחסם: אין שירות, אין סמכות, אין פרסום אוטומטי', () => {
  const cfg = getCorrectionsConfig({
    ...baseEnv, NODE_ENV: 'production', CORRECTIONS_VERIFY_URL: 'https://verify.example.org', CORRECTIONS_VERIFY_MOCK: '1',
    CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content', CORRECTIONS_AUTO_PUBLISH: '1', CORRECTIONS_VERIFY_AUTO_REJECT: '1',
  });
  assert.equal(cfg.verify.enabled, false);
  assert.equal(cfg.verify.disabledReason, 'mock_forbidden_in_production');
  assert.equal(cfg.verify.authority, 'none');
  assert.equal(cfg.autoPublish, false);
  assert.equal(cfg.verify.autoRejectAllowed, false);
  assert.ok(cfg.errors.some((e) => e.includes('MOCK')));
  const local = getCorrectionsConfig({ ...baseEnv, NODE_ENV: 'production', CORRECTIONS_VERIFY_URL: 'https://localhost:4555' });
  assert.equal(local.verify.enabled, false);
  const http = getCorrectionsConfig({ ...baseEnv, NODE_ENV: 'production', CORRECTIONS_VERIFY_URL: 'http://verify.example.org' });
  assert.equal(http.verify.enabled, false);
});

test('הפרדת דגלים: פרסום כבוי עד טוקן; PR כברירת מחדל; direct דורש הרשאה מפורשת; יעד מההגדרה בלבד', () => {
  assert.equal(getCorrectionsConfig({}).publish.mode, 'disabled');
  const pr = getCorrectionsConfig({ CORRECTIONS_GITHUB_TOKEN: 't', CORRECTIONS_GITHUB_REPO: 'Otzaria/otzaria-library', CORRECTIONS_GITHUB_BRANCH: 'main' });
  assert.equal(pr.publish.mode, 'pr');
  const noTarget = getCorrectionsConfig({ CORRECTIONS_GITHUB_TOKEN: 't' });
  assert.equal(noTarget.publish.mode, 'disabled');
  assert.equal(noTarget.publish.disabledReason, 'publish_target_not_configured');
  const direct = getCorrectionsConfig({ CORRECTIONS_GITHUB_TOKEN: 't', CORRECTIONS_GITHUB_REPO: 'a/b', CORRECTIONS_GITHUB_BRANCH: 'main', CORRECTIONS_PUBLISH_MODE: 'direct' });
  assert.equal(direct.publish.disabledReason, 'direct_commit_not_authorized');
  const authority = getCorrectionsConfig({ ...baseEnv, CORRECTIONS_VERIFY_REQUESTED_SCOPE: 'technical_and_content' });
  assert.equal(authority.verify.requestedScope, 'technical_only');
  assert.equal(authority.autoPublish, false);
});

// ---------------------------------------------------------------- classify

test('[T9] כשל הרשאה/חוזה = permanent (ידני מיד, בלי retry)', () => {
  for (const status of [400, 401, 403, 404, 405, 410, 422]) assert.equal(classifyVerifyFailure({ kind: 'http', status }).cls, 'permanent');
  assert.equal(classifyVerifyFailure({ kind: 'response', reason: 'unsupported_api_version' }).cls, 'permanent');
  assert.equal(classifyVerifyFailure({ kind: 'network', code: 'ENOTFOUND' }).cls, 'permanent');
  assert.equal(classifyVerifyFailure({ kind: 'network', code: 'CERT_HAS_EXPIRED' }).reason, 'tls_failure');
  assert.equal(classifyVerifyFailure({ kind: 'config', reason: 'service_secret_missing' }).cls, 'permanent');
});

test('[T10] timeout/429/5xx/רשת = transient; לא מוכר = unknown', () => {
  assert.equal(classifyVerifyFailure({ kind: 'timeout' }).cls, 'transient');
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(classifyVerifyFailure({ kind: 'http', status }).cls, 'transient');
  assert.equal(classifyVerifyFailure({ kind: 'network', code: 'ECONNRESET' }).cls, 'transient');
  assert.equal(classifyVerifyFailure({ kind: 'service_failed', reasonCode: 'service_capacity' }).cls, 'transient');
  assert.equal(classifyVerifyFailure({ kind: 'http', status: 418 }).cls, 'unknown');
  assert.equal(classifyVerifyFailure({ kind: 'http', status: 302 }).cls, 'unknown');
  assert.equal(classifyVerifyFailure({ kind: 'weird' }).cls, 'unknown');
  assert.deepEqual(describeFetchError(Object.assign(new Error('x'), { name: 'TimeoutError' })), { kind: 'timeout' });
});

test('[T10][T11] backoff מעריכי עם jitter, Retry-After עד התקרה, ומיצוי ניסיונות/זמן', () => {
  const now = new Date('2026-09-15T00:00:00Z');
  const deadline = new Date(now.getTime() + 86_400_000);
  const r1 = computeRetry({ attempts: 1, maxAttempts: 6, deadlineAt: deadline, now, baseSeconds: 30, capSeconds: 3600, random: () => 0 });
  assert.equal(r1.delaySeconds, 15);
  const r3 = computeRetry({ attempts: 3, maxAttempts: 6, deadlineAt: deadline, now, baseSeconds: 30, capSeconds: 3600, random: () => 1 });
  assert.equal(r3.delaySeconds, 120);
  const ra = computeRetry({ attempts: 1, maxAttempts: 6, deadlineAt: deadline, now, baseSeconds: 30, capSeconds: 3600, retryAfterSeconds: 999_999, random: () => 0 });
  assert.equal(ra.delaySeconds, 3600);
  assert.deepEqual(computeRetry({ attempts: 6, maxAttempts: 6, deadlineAt: deadline, now, baseSeconds: 30, capSeconds: 3600 }), { exhausted: true, reason: 'retries_exhausted' });
  const dl = computeRetry({ attempts: 1, maxAttempts: 6, deadlineAt: new Date(now.getTime() + 1000), now, baseSeconds: 30, capSeconds: 3600, random: () => 0 });
  assert.deepEqual(dl, { exhausted: true, reason: 'deadline_exhausted' });
  assert.equal(parseRetryAfter('120'), 120);
  assert.equal(parseRetryAfter(new Date(now.getTime() + 60_000).toUTCString(), now), 60);
  assert.equal(parseRetryAfter('garbage'), null);
});

// ---------------------------------------------------------------- protocol

const REQ = { request_id: 'req_1', report_id: 'rep1', proposal_revision: 1 };
const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
function mkChange(over = {}) {
  const c = { path: PATH, base_blob_sha: 'a'.repeat(40), line_index: 2, original_line: 'שורה ישנה', new_line: 'שורה חדשה', ...over };
  return {
    change_id: 'chg_s1', change_digest: computeChangeDigest(c),
    target: { repo: 'Otzaria/otzaria-library', path: c.path, line_index: c.line_index },
    base: { commit_sha: 'b'.repeat(40), blob_sha: c.base_blob_sha }, original_line: c.original_line, new_line: c.new_line,
  };
}
function resp(over = {}) {
  return {
    api_version: '1', request_id: 'req_1', report_id: 'rep1', proposal_revision: 1, workflow_generation: 3, decision_id: 'dec_1',
    processing_status: 'completed', decision: 'approved', approval_scope: 'technical_only', reason_code: 'ok', message: 'ok', change: mkChange(), ...over,
  };
}
const vctx = (over = {}) => ({ request: REQ, currentGeneration: 3, siteAuthority: 'technical_and_content', ...over });

test('[T15] תשובה פגומה / מזהים לא תואמים / גרסה לא נתמכת / digest שגוי → לא תקינה', () => {
  assert.equal(validateVerifyResponse('x', vctx()).reason, 'invalid_json');
  assert.equal(validateVerifyResponse(resp({ api_version: '2' }), vctx()).reason, 'unsupported_api_version');
  assert.equal(validateVerifyResponse(resp({ request_id: 'req_x' }), vctx()).reason, 'response_mismatch');
  assert.equal(validateVerifyResponse(resp({ report_id: 'other' }), vctx()).reason, 'response_mismatch');
  assert.equal(validateVerifyResponse(resp({ proposal_revision: 2 }), vctx()).reason, 'response_mismatch');
  assert.equal(validateVerifyResponse(resp({ decision: 'maybe' }), vctx()).reason, 'unknown_decision');
  assert.equal(validateVerifyResponse(resp({ change: { ...mkChange(), change_digest: 'f'.repeat(64) } }), vctx()).reason, 'invalid_response');
  assert.equal(validateVerifyResponse(resp({ approval_scope: null }), vctx()).reason, 'invalid_response');
  assert.equal(validateVerifyResponse(resp({ change: null }), vctx()).reason, 'invalid_response');
});

test('[T15] generation ישן → stale (נשמר להיסטוריה בלבד); 202 אינו אישור', () => {
  const r = validateVerifyResponse(resp({ workflow_generation: 2 }), vctx());
  assert.equal(r.ok, true);
  assert.equal(r.stale, true);
  const p = validateVerifyResponse({ api_version: '1', request_id: 'req_1', processing_status: 'pending', job_id: 'job_1', poll_after_seconds: 30 }, vctx());
  assert.equal(p.kind, 'pending');
});

const rctx = (over = {}) => ({
  requestedScope: 'technical_and_content', siteAuthority: 'technical_and_content', autoPublish: true, autoRejectAllowed: false,
  sentNewLine: 'שורה חדשה', sentPath: PATH, sentLineIndex: 2, sentBlobSha: 'a'.repeat(40), sentRepo: 'Otzaria/otzaria-library',
  manualActive: false, finalState: false, localAlreadyFixedVerified: false, ...over,
});

test('[T12] approved + technical_only → מתנדב, לעולם לא פרסום', () => {
  const v = validateVerifyResponse(resp(), vctx()).value;
  assert.deepEqual(routeVerifyDecision(v, rctx()), { route: 'manual', handoffReason: 'needs_content_review' });
});

test('[T13] approved מלא → פרסום רק כשכל תנאי המדיניות מתקיימים', () => {
  const v = validateVerifyResponse(resp({ approval_scope: 'technical_and_content' }), vctx()).value;
  assert.equal(routeVerifyDecision(v, rctx()).route, 'publish');
  assert.equal(routeVerifyDecision(v, rctx({ autoPublish: false })).route, 'manual');
  assert.equal(routeVerifyDecision(v, rctx({ requestedScope: 'technical_only' })).route, 'manual');
  assert.equal(routeVerifyDecision(v, rctx({ siteAuthority: 'technical_only' })).route, 'manual');
  assert.equal(routeVerifyDecision(v, rctx({ manualActive: true })).route, 'manual');
  assert.equal(routeVerifyDecision(v, rctx({ sentBlobSha: 'c'.repeat(40) })).route, 'manual');
  assert.equal(routeVerifyDecision(v, rctx({ sentNewLine: 'אחר' })).handoffReason, 'service_modified_proposal');
});

test('[T14] שירות שטוען לסמכות מלאה כשהאתר מתיר technical_only → מדורג ונרשם authority_exceeded', () => {
  const r = validateVerifyResponse(resp({ approval_scope: 'technical_and_content' }), vctx({ siteAuthority: 'technical_only' }));
  assert.equal(r.authorityExceeded, true);
  assert.equal(r.value.approvalScope, 'technical_only');
  assert.equal(routeVerifyDecision(r.value, rctx({ siteAuthority: 'technical_only' })).route, 'manual');
});

test('ניתוב: rejected בלי סמכות → ידני; already_fixed רק אחרי אימות מקומי; reason_code לא מוכר → ידני', () => {
  const rej = validateVerifyResponse(resp({ decision: 'rejected', approval_scope: null, change: null, reason_code: 'content_wrong' }), vctx()).value;
  assert.equal(routeVerifyDecision(rej, rctx()).handoffReason, 'manual_reject_review');
  assert.equal(routeVerifyDecision(rej, rctx({ autoRejectAllowed: true })).route, 'close_rejected');
  const af = validateVerifyResponse(resp({ decision: 'already_fixed', approval_scope: null }), vctx()).value;
  assert.equal(routeVerifyDecision(af, rctx()).route, 'manual');
  assert.equal(routeVerifyDecision(af, rctx({ localAlreadyFixedVerified: true })).route, 'close_already_fixed');
  const unk = validateVerifyResponse(resp({ reason_code: 'zzz' }), vctx()).value;
  assert.equal(routeVerifyDecision(unk, rctx()).handoffReason, 'unknown_reason_code');
});

test('בקשת בדיקה נבנית מההצעה והמקור בלבד (בלי פרטי קשר)', () => {
  const req = buildVerifyRequest({
    report: { _id: 'rep1', reportId: 'c1', workflowGeneration: 3, reportKind: 'text_correction', bookTitle: 'ב', currentRef: 'ב א', senderEmail: 'secret@example.com', sourceFolder: 'X' },
    revision: { revision: 1, originalLine: 'א', originalSelection: null, proposedText: 'ב' }, requestId: 'req_1', requestedScope: 'technical_only',
    source: { repo: 'o/r', ref: 'main', commitSha: 'c'.repeat(40), path: 'p', blobSha: 'd'.repeat(40), lineIndex: 0, currentLine: 'א', match: 'exact' },
  });
  assert.equal(JSON.stringify(req).includes('secret@example.com'), false);
  assert.equal(req.proposal.proposed_text, 'ב');
  assert.equal(req.workflow_generation, 3);
});

test('[T8][T28] ניתוב קליטה: חופשי/ללא הצעה/שירות כבוי → ידני; שירות פעיל → outbox; מייל שלא לאוצריא → email_only', () => {
  const corr = { originalLine: 'א ב', originalSelection: null, proposedText: 'א ג', contextBefore: '', contextAfter: '' };
  const off = { enabled: false, disabledReason: 'service_not_configured' };
  assert.deepEqual(planIntakeRouting({ kind: 'free_text', correction: null, reachesOtzaria: true, verifyConfig: off }).route, 'manual');
  assert.equal(planIntakeRouting({ kind: 'text_correction', correction: corr, reachesOtzaria: true, verifyConfig: off }).reason, 'service_not_configured');
  assert.equal(planIntakeRouting({ kind: 'text_correction', correction: { ...corr, proposedText: null }, reachesOtzaria: true, verifyConfig: { enabled: true } }).reason, 'no_proposal');
  assert.equal(planIntakeRouting({ kind: 'text_correction', correction: corr, reachesOtzaria: true, verifyConfig: { enabled: true } }).route, 'verify');
  assert.equal(planIntakeRouting({ kind: 'text_correction', correction: { ...corr, proposedText: 'א\nב' }, reachesOtzaria: true, verifyConfig: { enabled: true } }).reason, 'structural_change');
  assert.equal(planIntakeRouting({ kind: 'text_correction', correction: corr, reachesOtzaria: false, verifyConfig: { enabled: true } }).route, 'email_only');
});

test('תוויות: כל תוויות הדרישות נגזרות מהמצב', () => {
  const t = (r) => deriveLabels({ state: 'open', ...r }).map((l) => l.text);
  assert.ok(t({ approval: { authority: 'service', scope: 'technical_only' } }).includes('אושר טכנית בלבד'));
  assert.ok(t({ manual: { handoffReason: 'needs_content_review' } }).includes('נדרש אישור תוכן'));
  assert.ok(t({ manual: { handoffReason: 'service_not_configured' } }).includes('השירות אינו מוגדר'));
  assert.ok(t({ verification: { status: 'queued', attempts: 2 } }).includes('ממתין לניסיון חוזר'));
  assert.ok(t({ manual: { handoffReason: 'retries_exhausted' } }).includes('מוצו הניסיונות'));
  assert.ok(t({ manual: { handoffReason: 'source_changed' } }).includes('התנגשות'));
  assert.ok(t({ approval: { authority: 'volunteer', scope: 'technical_and_content' }, publish: { status: 'ready' } }).includes('אושר וממתין לפרסום'));
  assert.ok(t({ publish: { status: 'failed' } }).includes('פרסום נכשל'));
  assert.ok(t({ publish: { status: 'unknown_needs_reconcile' } }).includes('תוצאת פרסום לא ידועה ונבדקת'));
  assert.ok(t({ state: 'closed_published', publish: { status: 'committed' } }).includes('פורסם במקור'));
  assert.ok(!t({ publish: { status: 'pr_opened' } }).includes('פורסם במקור'));
});

test('diff תצוגה: מילה + גרפמה (אות עם ניקוד לא מתפצלת), טקסט בלבד', async () => {
  const { buildDiffView, graphemes, revealInvisible } = await import('./diff-view.js');
  assert.deepEqual(graphemes('בְּרֵ'), ['בְּ', 'רֵ']);
  const v = buildDiffView('בָּרָ֣א אֱלֹהִ֑ים', 'בָּרָ֣א אֱלֹקִ֑ים');
  const change = v.find((s) => s.type === 'change');
  assert.ok(change);
  assert.deepEqual(change.before.filter((c) => c.type === 'del').map((c) => c.text), ['הִ֑']);
  assert.deepEqual(change.after.filter((c) => c.type === 'add').map((c) => c.text), ['קִ֑']);
  const html = buildDiffView('<b>x</b>', '<script>alert(1)</script>');
  assert.ok(html.every((s) => (s.text === undefined || typeof s.text === 'string')));
  assert.equal(revealInvisible('א\u00a0ב'), 'א⍽ב');
});
