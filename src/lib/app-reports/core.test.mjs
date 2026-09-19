/**
 * בדיקות הליבה הטהורה של דיווחי התוכנה. הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAppReport, MAX_DIAGNOSTICS_BYTES, MAX_IMAGES, MAX_IMAGE_BYTES, MAX_BODY_BYTES, sniffImageType } from './validation.js';
import { computeContentHash, computeSignatureHash } from './hashes.js';
import { redactEmails } from './redact.js';
import { buildIssueTitle, buildIssueBody, buildMergeComment, issueLabels } from './issue-text.js';
import { planPublication } from './merge.js';
import { planClosureNotifications, closureKind, CLOSURE_TEXT_HE } from './state-change.js';
import { createUnsubscribeToken, verifyUnsubscribeToken, buildUnsubscribeUrl } from './unsubscribe.js';
import { getAppReportsConfig } from './config.js';
import { verifyGithubSignature } from './webhook.js';
import crypto from 'node:crypto';
import { hasAppReportsAccess, ALL_ADMIN_ROLES, ROLE_LABELS } from '../roles.js';

const manual = (over = {}) => ({
  schema: 1, reportId: '6f1c1f0e-8a43-4d1f-9b7e-1f0b7c7f0a11', type: 'bug', trigger: 'manual',
  title: 'החיפוש לא עובד', description: 'לחצתי על חיפוש ולא קרה כלום', stepsToReproduce: '1. פתח\n2. חפש',
  reporterEmail: 'User@Example.com', appVersion: '0.9.98', platform: 'windows', osVersion: '10.0.26200', arch: 'x64',
  createdAt: '2026-09-17T10:00:00.000Z',
  attachments: { diagnostics: { settings: { a: 1 } }, errorLog: 'Exception at C:\\Users\\<user>\\x.dart' },
  ...over,
});

const crash = (over = {}) => manual({
  type: 'crash', trigger: 'auto_crash', title: 'קריסה: StateError', description: '', stepsToReproduce: undefined, reporterEmail: '',
  signature: { exceptionType: 'StateError', frames: ['package:otzaria/a.dart in foo', 'package:otzaria/b.dart in bar'] },
  ...over,
});

// ---------------------------------------------------------------- validation

test('ולידציה: דיווח ידני תקין מנורמל (מייל באותיות קטנות)', () => {
  const r = validateAppReport(manual());
  assert.equal(r.ok, true);
  assert.equal(r.value.reporterEmail, 'user@example.com');
  assert.equal(r.value.clientCreatedAt.toISOString(), '2026-09-17T10:00:00.000Z');
  assert.deepEqual(r.value.diagnostics, { settings: { a: 1 } });
});

test('ולידציה: מייל חובה רק בדיווח ידני', () => {
  for (const email of [undefined, '']) {
    const r = validateAppReport(manual({ reporterEmail: email }));
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
    assert.equal(r.field, 'reporterEmail');
  }
  for (const trigger of ['crash_prompt', 'auto_crash']) {
    assert.equal(validateAppReport(crash({ trigger, reporterEmail: undefined })).ok, true);
    assert.equal(validateAppReport(crash({ trigger, reporterEmail: '' })).ok, true);
  }
});

test('ולידציה: מייל לא תקין שאינו ריק נדחה גם בקריסה', () => {
  const r = validateAppReport(crash({ reporterEmail: 'not-an-email' }));
  assert.equal(r.ok, false);
  assert.equal(r.field, 'reporterEmail');
});

test('ולידציה: תיאור חובה רק בדיווח ידני', () => {
  assert.equal(validateAppReport(manual({ description: '   ' })).field, 'description');
  assert.equal(validateAppReport(crash({ description: '' })).ok, true);
});

test('ולידציה: ערכים לא מוכרים ושדות חסרים → 422 עם שם השדה', () => {
  const cases = [
    [{ type: 'other' }, 'type'], [{ trigger: 'x' }, 'trigger'], [{ platform: 'beos' }, 'platform'],
    [{ title: '' }, 'title'], [{ title: 'א'.repeat(201) }, 'title'], [{ appVersion: '' }, 'appVersion'],
    [{ reportId: '' }, 'reportId'], [{ reportId: 'x'.repeat(101) }, 'reportId'], [{ schema: 2 }, 'schema'],
    [{ description: 'א'.repeat(10001) }, 'description'], [{ stepsToReproduce: 'א'.repeat(5001) }, 'stepsToReproduce'],
    [{ osVersion: 'x'.repeat(201) }, 'osVersion'], [{ arch: 'x'.repeat(21) }, 'arch'], [{ sentryEventId: 'x'.repeat(65) }, 'sentryEventId'],
    [{ createdAt: '2026-09-17 10:00' }, 'createdAt'], [{ createdAt: '2026-09-17T10:00:00+02:00' }, 'createdAt'],
    [{ signature: { exceptionType: 'E', frames: ['a', 'b', 'c', 'd'] } }, 'signature.frames'],
    [{ signature: { exceptionType: 'E', frames: ['x'.repeat(301)] } }, 'signature.frames'],
    [{ attachments: { diagnostics: [] } }, 'attachments.diagnostics'],
    [{ attachments: { diagnostics: { big: 'x'.repeat(MAX_DIAGNOSTICS_BYTES) } } }, 'attachments.diagnostics'],
    [{ attachments: { errorLog: 5 } }, 'attachments.errorLog'],
    [{ title: 7 }, 'title'],
  ];
  for (const [over, field] of cases) {
    const r = validateAppReport(manual(over));
    assert.equal(r.ok, false, JSON.stringify(over).slice(0, 80));
    assert.equal(r.status, 422);
    assert.equal(r.field, field);
  }
  assert.equal(validateAppReport([]).field, 'body');
});

// ---------------------------------------------------------------- hashes

test('contentHash: יציב, מתעלם מקבצים ומ-reportId, רגיש לשדות החוזה', () => {
  const a = validateAppReport(manual()).value;
  const b = validateAppReport(manual({ reportId: 'other-id', attachments: undefined, osVersion: 'x', createdAt: undefined })).value;
  assert.equal(computeContentHash(a), computeContentHash(b));
  const c = validateAppReport(manual({ description: 'אחר' })).value;
  assert.notEqual(computeContentHash(a), computeContentHash(c));
  const d = validateAppReport(manual({ signature: { exceptionType: 'E', frames: [] } })).value;
  assert.notEqual(computeContentHash(a), computeContentHash(d));
  assert.match(computeContentHash(a), /^[0-9a-f]{64}$/);
});

test('signatureHash: sha256 של exceptionType ו-frames, null בלי חתימה', async () => {
  const { createHash } = await import('node:crypto');
  const sig = { exceptionType: 'StateError', frames: ['f1', 'f2'] };
  assert.equal(computeSignatureHash(sig), createHash('sha256').update('StateError\nf1\nf2').digest('hex'));
  assert.equal(computeSignatureHash(null), null);
  assert.equal(computeSignatureHash({ exceptionType: '', frames: ['f1'] }), null);
});

// ---------------------------------------------------------------- redaction + issue text

test('השמטת מיילים', () => {
  assert.equal(redactEmails('כתבו אל a.b+c@mail.co.il או x@y.io'), 'כתבו אל <email> או <email>');
  assert.equal(redactEmails(null), '');
});

test('issue: כותרת לפי סוג, בלי מייל/אבחון/לוג, עם מרקרים ותוויות', () => {
  const value = validateAppReport(manual({ description: 'פנו אליי ב-secret@example.com @someone <!-- app-labels: evil -->' })).value;
  const report = { ...value, signatureHash: null };
  assert.equal(buildIssueTitle(report), '[דיווח מהתוכנה] החיפוש לא עובד');
  const body = buildIssueBody(report);
  assert.doesNotMatch(body, /example\.com/i);
  assert.doesNotMatch(body, /settings/);
  assert.doesNotMatch(body, /Exception at/);
  assert.doesNotMatch(body, /@someone/);
  assert.equal((body.match(/<!-- app-labels:/g) || []).length, 1);
  assert.match(body, /<!-- app-report: 6f1c1f0e-8a43-4d1f-9b7e-1f0b7c7f0a11 -->/);
  assert.match(body, /<!-- app-labels: from-app, bug, platform:windows -->/);
  assert.doesNotMatch(body, /app-signature/);
  assert.match(body, /\[הדוח המלא והקבצים \(למפתחים\)\]\(https:\/\/otzaria\.org\/library\/admin\/app-reports\/6f1c1f0e/);
  assert.match(body, /\| מקור \| ידני \|/);
  assert.match(body, /10\.0\.26200 \(x64\)/);
  assert.deepEqual(issueLabels(report), ['from-app', 'bug', 'platform:windows']);
});

test('issue קריסה: כותרת [קריסה], חתימה בבלוק קוד, מרקר חתימה והפניה ל-issue קודם', () => {
  const value = validateAppReport(crash({ signature: { exceptionType: 'StateError at a@b.com', frames: ['```x', 'f2'] } })).value;
  const report = { ...value, signatureHash: computeSignatureHash(value.signature) };
  assert.equal(buildIssueTitle(report), '[קריסה] קריסה: StateError');
  const body = buildIssueBody(report, { previousIssueNumber: 42 });
  assert.match(body, new RegExp(`<!-- app-signature: ${report.signatureHash} -->`));
  assert.match(body, /````\nStateError at <email>\n```x\nf2\n````/);
  assert.match(body, /קודם: #42/);
  assert.match(body, /_\(ללא תיאור\)_/);
});

test('תגובת איחוד: גרסה, מערכת, מקור, תיאור וקישור — בלי מייל', () => {
  const value = validateAppReport(crash({ trigger: 'crash_prompt', description: 'קרס שוב, me@x.org', reporterEmail: 'me@x.org' })).value;
  const comment = buildMergeComment(value);
  assert.match(comment, /0\.9\.98/);
  assert.match(comment, /אחרי קריסה/);
  assert.match(comment, /קרס שוב, <email>/);
  assert.doesNotMatch(comment, /me@x\.org/);
  assert.match(comment, /app-reports\/6f1c1f0e/);
});

test('כותרת ארוכה מקוצרת ל-256 התווים ש-GitHub מקבל', () => {
  const value = validateAppReport(manual({ title: '@a'.repeat(100) })).value;
  const title = buildIssueTitle({ ...value, signatureHash: null });
  assert.ok([...title].length <= 256, `אורך ${[...title].length}`);
  assert.match(title, /…$/);
});

test('תא בטבלה: קו נטוי הפוך לפני קו אנכי אינו שובר את הטבלה', () => {
  const value = validateAppReport(manual({ osVersion: 'win \\| 11 | x' })).value;
  const row = buildIssueBody({ ...value, signatureHash: null }).split('\n').find((l) => l.startsWith('| מערכת הפעלה'));
  // פיצול תאים כמו GFM: קו נטוי הפוך מבטל את התו שאחריו
  const cells = [''];
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === '\\') { cells[cells.length - 1] += row[i + 1] ?? ''; i += 1; }
    else if (row[i] === '|') cells.push('');
    else cells[cells.length - 1] += row[i];
  }
  assert.equal(cells.length, 4);
  assert.match(cells[2], /win \\\| 11 \| x/);
});

// ---------------------------------------------------------------- merge decision

test('החלטת איחוד: issue פתוח → תגובה; רק סגורים → חדש עם הקודם האחרון; כלום → חדש', () => {
  const d = (s) => new Date(`2026-09-${s}T00:00:00Z`);
  assert.deepEqual(planPublication([
    { issueNumber: 5, issueState: 'closed', createdAt: d('10') },
    { issueNumber: 7, issueState: 'open', createdAt: d('01'), issueUrl: 'u7' },
  ]), { action: 'comment', issueNumber: 7, issueUrl: 'u7' });
  assert.deepEqual(planPublication([
    { issueNumber: 5, issueState: 'closed', createdAt: d('01') },
    { issueNumber: 9, issueState: 'closed', createdAt: d('12') },
  ]), { action: 'create', previousIssueNumber: 9 });
  assert.deepEqual(planPublication([]), { action: 'create', previousIssueNumber: null });
});

// ---------------------------------------------------------------- state change

test('מיילי סגירה: רק עם מייל, לא הוסר, לא קיבל; מייל אחד לכל כתובת', () => {
  const plan = planClosureNotifications([
    { reportId: 'a', reporterEmail: 'x@y.com' },
    { reportId: 'b', reporterEmail: 'X@y.com' },
    { reportId: 'c', reporterEmail: null },
    { reportId: 'd', reporterEmail: 'z@y.com', unsubscribed: true },
    { reportId: 'e', reporterEmail: 'w@y.com', notifiedClosedAt: new Date() },
    { reportId: 'f', reporterEmail: 'v@y.com' },
  ]);
  assert.deepEqual(plan.map((g) => [g.email, g.reports.map((r) => r.reportId)]), [['x@y.com', ['a', 'b']], ['v@y.com', ['f']]]);
});

test('סיבת סגירה → סוג טקסט', () => {
  assert.equal(closureKind('completed'), 'completed');
  assert.equal(closureKind('not_planned'), 'not_planned');
  assert.equal(closureKind('duplicate'), 'duplicate');
  assert.equal(closureKind(null), 'other');
  assert.equal(closureKind('reopened'), 'other');
  for (const k of ['completed', 'not_planned', 'duplicate', 'other']) assert.ok(CLOSURE_TEXT_HE[k]);
});

// ---------------------------------------------------------------- unsubscribe + config + roles

test('טוקן הסרה: אימות, זיוף נדחה, סוד אחר נדחה', () => {
  const t = createUnsubscribeToken('rep-1', 's3cret');
  assert.equal(verifyUnsubscribeToken(t, 's3cret'), 'rep-1');
  assert.equal(verifyUnsubscribeToken(t, 'other'), null);
  const forged = `${Buffer.from('rep-2').toString('base64url')}.${t.split('.')[1]}`;
  assert.equal(verifyUnsubscribeToken(forged, 's3cret'), null);
  assert.equal(verifyUnsubscribeToken('garbage', 's3cret'), null);
  assert.equal(verifyUnsubscribeToken(t, null), null);
  assert.match(buildUnsubscribeUrl('https://otzaria.org/', 'rep-1', 's3cret'), /^https:\/\/otzaria\.org\/api\/app-reports\/unsubscribe\?token=/);
});

test('config: ריפו קבוע בקוד, סוד ההסרה הוא NEXTAUTH_SECRET בלבד', () => {
  const c = getAppReportsConfig({ NEXTAUTH_SECRET: 'n', APP_REPORTS_GITHUB_REPO: 'other/repo' });
  assert.equal(c.repo, 'Otzaria/otzaria');
  assert.equal(c.unsubscribeSecret, 'n');
  assert.equal(c.githubToken, null);
  assert.equal(getAppReportsConfig({ APP_REPORTS_UNSUBSCRIBE_SECRET: 'u' }).unsubscribeSecret, null);
  assert.equal(getAppReportsConfig({}).unsubscribeSecret, null);
});

test('תפקיד מפתח: גישה לדיווחים בלבד, לא חלק מ-ALL_ADMIN_ROLES', () => {
  assert.equal(hasAppReportsAccess('developer'), true);
  assert.equal(hasAppReportsAccess('admin'), true);
  assert.equal(hasAppReportsAccess('admin_books'), false);
  assert.equal(ALL_ADMIN_ROLES.includes('developer'), false);
  assert.equal(ROLE_LABELS.developer, 'מפתח');
});

test('חתימת webhook: רק HMAC-SHA256 של הגוף המדויק עם הסוד הנכון', () => {
  const body = Buffer.from('{"action":"closed"}');
  const sign = (secret, data = body) => `sha256=${crypto.createHmac('sha256', secret).update(data).digest('hex')}`;
  assert.equal(verifyGithubSignature(body, sign('s3cret'), 's3cret'), true);
  assert.equal(verifyGithubSignature(body, sign('other'), 's3cret'), false);
  assert.equal(verifyGithubSignature(Buffer.from('{"action":"reopened"}'), sign('s3cret'), 's3cret'), false);
  assert.equal(verifyGithubSignature(body, sign('s3cret').replace('sha256=', 'sha1='), 's3cret'), false);
  assert.equal(verifyGithubSignature(body, 'sha256=short', 's3cret'), false);
  assert.equal(verifyGithubSignature(body, null, 's3cret'), false);
  assert.equal(verifyGithubSignature(body, sign(''), ''), false);
  assert.equal(getAppReportsConfig({ APP_REPORTS_WEBHOOK_SECRET: ' x ' }).webhookSecret, 'x');
  assert.equal(getAppReportsConfig({}).webhookSecret, null);
  // טוקן יחיד: אותו טוקן שהאתר כותב בו לספרייה, בלי עקיפה ייעודית
  assert.equal(getAppReportsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 'shared' }).githubToken, 'shared');
  assert.equal(getAppReportsConfig({ APP_REPORTS_GITHUB_TOKEN: 'own' }).githubToken, null);
  assert.equal(getAppReportsConfig({}).githubToken, null);
});

// ---------------------------------------------------------------- images

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]);
const img = (buf, over = {}) => ({ fileName: 'shot.png', mimeType: 'image/png', data: buf.toString('base64'), ...over });
const withImages = (images) => manual({ attachments: { images } });

test('תמונות: PNG ו-JPEG נקלטים; הסוג נקבע לפי הבתים ולא לפי ההצהרה', () => {
  const r = validateAppReport(withImages([img(PNG), img(JPEG, { fileName: 'b.jpg', mimeType: 'image/png' })]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.images.map((i) => [i.mimeType, i.fileName]), [['image/png', 'shot.png'], ['image/jpeg', 'b.jpg']]);
  assert.deepEqual(r.value.images[0].buffer, PNG);
  assert.deepEqual(validateAppReport(manual()).value.images, []);
});

test('תמונות: קובץ שאינו PNG/JPEG, base64 פגום, חריגה בכמות ובגודל → 422', () => {
  const cases = [
    [[img(Buffer.from('GIF89a...'))], 'attachments.images[0]'],
    [[img(PNG, { data: '@@@' })], 'attachments.images[0]'],
    [[{ fileName: 'x.png' }], 'attachments.images[0]'],
    [Array.from({ length: MAX_IMAGES + 1 }, () => img(PNG)), 'attachments.images'],
    [[img(Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]))], 'attachments.images[0]'],
    ['not-an-array', 'attachments.images'],
  ];
  for (const [images, field] of cases) {
    const r = validateAppReport(withImages(images));
    assert.equal(r.ok, false, field);
    assert.equal(r.status, 422);
    assert.equal(r.field, field);
  }
});

test('תמונות: שם הקובץ מנוקה מנתיב ומתווי בקרה; שם ריק מקבל ברירת מחדל', () => {
  const r = validateAppReport(withImages([img(PNG, { fileName: 'C:\\Users\\dani\\a"b\u0001.png' }), img(JPEG, { fileName: '' })]));
  assert.deepEqual(r.value.images.map((i) => i.fileName), ['ab.png', 'image-2.jpg']);
});

test('תמונות: זיהוי סוג לפי חתימה ותקרת הגוף מכילה את המכסה המקודדת', () => {
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50])), null);
  assert.ok(MAX_BODY_BYTES > Math.ceil((3 * MAX_IMAGE_BYTES) / 3) * 4);
});

test('issue: צילומי המסך מוטמעים בגוף ובתגובה מהקישור הציבורי', () => {
  const tokens = ['a'.repeat(32), 'b'.repeat(32)];
  const value = { ...validateAppReport(manual()).value, fileIds: { images: tokens.map((publicToken) => ({ publicToken })) } };
  const body = buildIssueBody(value);
  assert.match(body, /### צילומי מסך/);
  assert.ok(body.includes(`![צילום מסך 1](https://otzaria.org/api/app-reports/images/${tokens[0]})`));
  assert.ok(body.includes(`![צילום מסך 2](https://otzaria.org/api/app-reports/images/${tokens[1]})`));
  assert.ok(buildMergeComment(value).includes(`/api/app-reports/images/${tokens[1]})`));
  assert.doesNotMatch(buildIssueBody(validateAppReport(manual()).value), /צילומי מסך/);
});
