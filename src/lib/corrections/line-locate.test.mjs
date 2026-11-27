/**
 * איתור שורת הדיווח כשאין נתיב מהימן (גיבוי לפי שם קובץ/ספר) וכשהתגיות בקובץ שונות מאלה שבדיווח. ללא רשת.
 * כל תוצאה מותנית בייחוד; ספק נשאר ידני, ו"כבר תוקן" נסגר רק לפי הכלל המחמיר (already-applied.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSource, matchLineLoose } from './resolver.js';
import { isExactlyApplied } from './already-applied.js';
import { createGitSource } from './git-source.js';
import { ByteLru } from './lru.js';
import { createRepoClient } from '../dicta/github-api.js';
import { FakeGitHub } from './testing/fake-github.js';
import { buildVerifyRequest, routeVerifyDecision, sanitizeEvidence, MAX_EVIDENCE } from './verify-protocol.js';
import { HANDOFF_REASON_LABELS } from './states.js';

const REPO = 'Otzaria/otzaria-library';
const SRC = { repo: REPO, ref: 'main' };
const ROOT = 'ToratEmetToOtzaria/ספרים/אוצריא';
const PATH = `${ROOT}/תנך/תורה/בראשית.txt`;
const HEAD = '<h1>בראשית</h1>';
const FOOT = 'ויאמר אלהים <sup class="footnote-marker">1</sup> יהי אור ויהי אור בעולם הזה כולו';
const FIXED_FOOT = 'ויאמר אלקים <sup class="footnote-marker">1</sup> יהי אור ויהי אור בעולם הזה כולו';
const FILE_FOOT = 'ויאמר אלהים <sup>1</sup> יהי אור ויהי אור בעולם הזה כולו';
const PAD = ['שורה ראשונה של הפרק הזה בספר', 'שורה שנייה של הפרק הזה בספר', 'שורה שלישית של הפרק הזה בספר'];
const file = (...lines) => [HEAD, ...lines].join('\n');

function setup(files) {
  const gh = new FakeGitHub({ repo: REPO, files });
  const client = createRepoClient({ repo: REPO, token: 't', fetchImpl: gh.fetch });
  return { gh, git: createGitSource({ client, ref: 'main', cache: new ByteLru(1 << 20) }) };
}
const report = (over = {}) => ({
  _id: 'rep1', bookTitle: 'בראשית', currentRef: 'בראשית א', sourceFolder: 'ToratEmetToOtzaria', filePath: 'אוצריא/תנך/תורה/בראשית.txt',
  sourceHint: { sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath: 'אוצריא/תנך/תורה/בראשית.txt' }, location: { lineIndex: 2 }, ...over,
});
const noPath = (over = {}) => report({ location: { lineIndex: 1 }, filePath: '', sourceHint: { sourceFolder: 'ToratEmetToOtzaria' }, ...over });
const rev = (over = {}) => ({ revision: 1, originalLine: PAD[0], originalSelection: null, proposedText: 'שורה ראשונה של הפרק הזה בספר!', ...over });
const resolve = (git, r, v, extra = {}) => resolveSource({ report: r, revision: v, gitSource: git, source: SRC, ...extra });

test('גיבוי לפי שם הספר: אין נתיב בכלל → הקובץ היחיד בשם הספר, ההתאמה מדויקת', async () => {
  const { git } = setup({ [PATH]: file(...PAD), [`${ROOT}/תנך/תורה/שמות.txt`]: file('אחר') });
  const r = await resolve(git, noPath(), rev());
  assert.equal(r.status, 'exact');
  assert.equal(r.path, PATH);
  assert.equal(r.pathMatch, 'name_fallback');
  assert.equal(r.lineIndex, 1);
  assert.equal(r.currentLine, PAD[0]);
});

test('גיבוי לפי שם: נתיב שהתיישן (הקובץ הועבר קטגוריה) → אותו שם קובץ בתיקייה אחרת תחת אותו מקור', async () => {
  const { git } = setup({ [`${ROOT}/תנך/מחברי זמננו/בראשית.txt`]: file(...PAD) });
  const stale = report({ location: { lineIndex: 1 }, filePath: 'אוצריא/תנך/אחרונים/בראשית.txt', sourceHint: { sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath: 'אוצריא/תנך/אחרונים/בראשית.txt' } });
  const r = await resolve(git, stale, rev());
  assert.equal(r.status, 'exact');
  assert.equal(r.path, `${ROOT}/תנך/מחברי זמננו/בראשית.txt`);
  assert.equal(r.pathMatch, 'name_fallback');
});

test('גיבוי לפי שם הספר: קובץ ששונה שמו (שם הקובץ מהנתיב לא קיים) נמצא לפי שם הספר', async () => {
  const { git } = setup({ [`${ROOT}/תנך/תורה/בראשית.txt`]: file(...PAD) });
  const stale = report({ location: { lineIndex: 1 }, filePath: 'אוצריא/תנך/תורה/בראשית ישן.txt', sourceHint: { sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath: 'אוצריא/תנך/תורה/בראשית ישן.txt' } });
  const r = await resolve(git, stale, rev());
  assert.equal(r.status, 'exact');
  assert.equal(r.path, PATH);
});

test('גיבוי לפי שם: כמה קבצים בשם → לא נבחר אף אחד (ידני, כמו היום)', async () => {
  const { git } = setup({ [PATH]: file(...PAD), [`${ROOT}/תנך/אחר/בראשית.txt`]: file(...PAD) });
  const a = await resolve(git, noPath(), rev());
  assert.equal(a.status, 'not_found');
  assert.equal(a.reason, 'no_candidate_path');
  const stale = report({ filePath: 'אוצריא/תנך/אין/בראשית.txt', sourceHint: { sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath: 'אוצריא/תנך/אין/בראשית.txt' } });
  const b = await resolve(git, stale, rev());
  assert.equal(b.status, 'not_found');
  assert.equal(b.reason, 'file_missing_in_repo');
});

test('גיבוי לפי שם: אין קובץ בשם, תיקיית מקור שאינה יעד, או כיבוי הגיבוי → not_found', async () => {
  const { git } = setup({ [PATH]: file(...PAD) });
  assert.equal((await resolve(git, noPath({ bookTitle: 'ספר שאינו קיים' }), rev())).status, 'not_found');
  const sefaria = noPath({ sourceFolder: 'sefariaToOtzaria', sourceHint: { sourceFolder: 'sefariaToOtzaria' } });
  assert.equal((await resolve(git, sefaria, rev())).reason, 'no_candidate_path');
  const off = await resolve(git, noPath(), rev(), { nameFallback: false });
  assert.equal(off.status, 'not_found');
  assert.equal(off.reason, 'no_candidate_path');
  // שם ספר עם תווי נתיב אינו נחפש
  assert.equal((await resolve(git, noPath({ bookTitle: '../בראשית' }), rev())).status, 'not_found');
});

test('גיבוי לפי שם: השורה חוזרת בקובץ → עמום (לא כותרת שנבחרה בטעות), גם כשהאינדקס שנשלח תואם', async () => {
  const { git } = setup({ [PATH]: file(PAD[0], PAD[1], PAD[0]) });
  const r = await resolve(git, noPath({ location: { lineIndex: 1 } }), rev());
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.pathMatch, 'name_fallback');
  // אותה שורה ונתיב שנשלח במלואו — ההתנהגות הקיימת (בלי גיבוי) לא השתנתה
  const hinted = await resolve(git, report({ location: { lineIndex: 1 } }), rev());
  assert.equal(hinted.status, 'exact');
  assert.equal(hinted.pathMatch, 'exact');
});

test('גיבוי לפי שם: הקובץ נמצא אך השורה לא → לא נבחרת שורה אחרת', async () => {
  const { git } = setup({ [PATH]: file('שורה אחרת לגמרי בספר הזה', PAD[1]) });
  const r = await resolve(git, noPath(), rev({ originalLine: 'שורה שאינה קיימת בקובץ בכלל ולא דומה' }));
  assert.notEqual(r.status, 'exact');
  assert.notEqual(r.status, 'relocated');
});

// ---- התאמה שמתעלמת מתגיות ----

test('תגיות: מאפיין בלבד שונה (class) → relocated בייחוד, השינוי מוחל על השורה הנוכחית בקובץ', async () => {
  const { git } = setup({ [PATH]: file(PAD[0], FILE_FOOT, PAD[2]) });
  const r = await resolve(git, report({ location: { lineIndex: 2 } }), rev({ originalLine: FOOT, proposedText: FIXED_FOOT }));
  assert.equal(r.status, 'relocated');
  assert.equal(r.matchBasis, 'tags');
  assert.equal(r.match, 'unique_normalized');
  assert.equal(r.lineIndex, 2);
  assert.equal(r.currentLine, FILE_FOOT);
  assert.equal(r.rebasedNewLine, 'ויאמר אלקים <sup>1</sup> יהי אור ויהי אור בעולם הזה כולו');
  assert.ok(r.context);
});

test('תגיות: השורה זזה והתגיות שונות → נמצאת בייחוד במקומה החדש', async () => {
  const { git } = setup({ [PATH]: file('פתיח', ...PAD, FILE_FOOT) });
  const r = await resolve(git, report({ location: { lineIndex: 2 } }), rev({ originalLine: FOOT, proposedText: FIXED_FOOT }));
  assert.equal(r.status, 'relocated');
  assert.equal(r.lineIndex, 5);
});

test('תגיות: שתי שורות שזהות בלי תגיות → עמום, נשאר source_changed (ידני)', async () => {
  const { git } = setup({ [PATH]: file(PAD[0], FILE_FOOT, PAD[2], FILE_FOOT.replace('<sup>1</sup>', '<sup class="x">1</sup>')) });
  const r = await resolve(git, report({ location: { lineIndex: 2 } }), rev({ originalLine: FOOT, proposedText: FIXED_FOOT }));
  assert.equal(r.status, 'source_changed');
  assert.equal(r.matchBasis, null);
});

test('תגיות: הבדל ברווחים בלבד נשאר source_changed כמו קודם; שורה קצרה או כותרת — אף פעם', async () => {
  const sp = setup({ [PATH]: file(PAD[0], `${FOOT} `) });
  assert.equal((await resolve(sp.git, report({ location: { lineIndex: 2 } }), rev({ originalLine: FOOT, proposedText: FIXED_FOOT }))).status, 'source_changed');
  assert.equal(matchLineLoose(file('<h3 class="a">יא</h3>'), { originalLine: '<h3>יא</h3>', newLine: '<h3>יב</h3>' }), null);
  assert.equal(matchLineLoose(file('<b>א</b> ב'), { originalLine: '<i>א</i> ב', newLine: '<i>ג</i> ב' }), null);
});

test('תגיות: השינוי נוגע בתגית עצמה שהשתנתה בקובץ → התנגשות, לא מאותר', async () => {
  const orig = 'ויאמר <b>אלהים</b> יהי אור ויהי אור בעולם הזה כולו';
  const inFile = 'ויאמר <big>אלהים</big> יהי אור ויהי אור בעולם הזה כולו';
  const proposed = 'ויאמר <i>אלקים</i> יהי אור ויהי אור בעולם הזה כולו';
  const { git } = setup({ [PATH]: file(PAD[0], inFile) });
  const r = await resolve(git, report({ location: { lineIndex: 2 } }), rev({ originalLine: orig, proposedText: proposed }));
  assert.notEqual(r.status, 'relocated');
  assert.equal(r.rebasedNewLine ?? null, null);
});

test('תגיות: המקור כבר תוקן עם תגיות אחרות → already_applied, נסגר רק לפי הכלל המחמיר', async () => {
  const inFile = 'ויאמר אלקים <sup>1</sup> יהי אור ויהי אור בעולם הזה כולו';
  const { git } = setup({ [PATH]: file(PAD[0], inFile) });
  const v = rev({ originalLine: FOOT, proposedText: FIXED_FOOT });
  const r = await resolve(git, report({ location: { lineIndex: 2 } }), v);
  assert.equal(r.status, 'already_applied');
  assert.equal(r.editApplied, true);
  assert.equal(isExactlyApplied(r, v), true);
  // אותה בדיקה אבל המקור המדווח עדיין בקובץ במקום אחר → לא נסגר
  const both = setup({ [PATH]: file(PAD[0], inFile, PAD[2], FILE_FOOT) });
  const b = await resolve(both.git, report({ location: { lineIndex: 2 } }), v);
  assert.equal(isExactlyApplied(b, v), false);
});

test('תגיות: "כבר תוקן" לא נסגר כששינוי התגיות של ההצעה אינו במקומו', async () => {
  const orig = 'ויאמר <b>אלהים</b> יהי אור ויהי אור בעולם הזה כולו';
  const proposed = 'ויאמר <strong>אלקים</strong> יהי אור ויהי אור בעולם הזה כולו';
  // בקובץ המילה תוקנה אבל התגית ההצעה (strong) לא הוחלה
  const inFile = 'ויאמר <b class="x">אלקים</b> יהי אור ויהי אור בעולם הזה כולו';
  const { git } = setup({ [PATH]: file(PAD[0], inFile) });
  const v = rev({ originalLine: orig, proposedText: proposed });
  const r = await resolve(git, report({ location: { lineIndex: 2 } }), v);
  assert.equal(isExactlyApplied(r, v), false);
  assert.notEqual(r.status, 'relocated');
});

test('תגיות: אין ספק יוצא למתנדבים — כל התאמה שאינה מדויקת אינה מאשרת/דוחה אוטומטית', () => {
  const approved = { decision: 'approved', reasonKnown: true, approvalScope: 'technical_and_content', change: { newLine: 'x', path: 'p', lineIndex: 1, baseBlobSha: 'b', repo: null } };
  const ctx = { requestedScope: 'technical_and_content', siteAuthority: 'technical_and_content', autoPublish: true, autoRejectAllowed: true, sentNewLine: 'x', sentPath: 'p', sentLineIndex: 1, sentBlobSha: 'b', sentRepo: REPO, manualActive: false, finalState: false };
  assert.deepEqual(routeVerifyDecision(approved, ctx), { route: 'publish' });
  assert.deepEqual(routeVerifyDecision(approved, { ...ctx, inexactMatch: true }), { route: 'manual', handoffReason: 'inexact_match_review' });
  const rejected = { decision: 'rejected', reasonKnown: true };
  assert.deepEqual(routeVerifyDecision(rejected, ctx), { route: 'close_rejected' });
  assert.deepEqual(routeVerifyDecision(rejected, { ...ctx, inexactMatch: true }), { route: 'manual', handoffReason: 'manual_reject_review' });
  assert.ok(HANDOFF_REASON_LABELS.inexact_match_review);
});

test('בקשת האימות: ה-diff נבנה מהשורה הנוכחית בקובץ ומהשינוי המוחל עליה', async () => {
  const { git } = setup({ [PATH]: file(PAD[0], FILE_FOOT, PAD[2]) });
  const v = rev({ originalLine: FOOT, proposedText: FIXED_FOOT });
  const src = await resolve(git, report({ location: { lineIndex: 2 } }), v);
  const req = buildVerifyRequest({ report: { _id: 'r', reportId: 'c', workflowGeneration: 1 }, revision: v, requestId: 'q', requestedScope: 'technical_and_content', source: src });
  assert.equal(req.source.current_line, FILE_FOOT);
  assert.equal(req.source.match, 'unique_normalized');
  assert.match(req.diff.unified, /\+ויאמר אלקים <sup>1<\/sup>/);
  assert.doesNotMatch(req.diff.unified, /footnote-marker/);
});

test('ראיות השירות: סניטציה — חיתוך, supports מוכר בלבד, בלי פריטים ריקים, עד התקרה', () => {
  assert.deepEqual(sanitizeEvidence(undefined), []);
  assert.deepEqual(sanitizeEvidence('x'), []);
  const out = sanitizeEvidence([
    { kind: 'parallel_text', source: 'בר-אילן', page: 12, snippet: 'ש'.repeat(900), supports: 'fix', score: 0.8, extra: 'x' },
    { kind: 'llm', supports: 'מוזר', score: 'גבוה' },
    { source: 'בלי סוג ובלי קטע' },
    null,
    'לא אובייקט',
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].snippet.length, 400);
  assert.equal(out[0].page, '12');
  assert.equal(out[0].supports, 'fix');
  assert.equal('extra' in out[0], false);
  assert.equal(out[1].supports, null);
  assert.equal(out[1].score, null);
  assert.equal(sanitizeEvidence(Array.from({ length: 60 }, () => ({ kind: 'lexical' }))).length, MAX_EVIDENCE);
});
