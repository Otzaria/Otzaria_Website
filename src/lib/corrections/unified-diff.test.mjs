/**
 * בדיקות ה-diff המאוחד (hunk + טקסט unified) ומודל התצוגה שלו. הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSourceLines } from './source-text.js';
import { extractLineContext, buildLineHunk, committedNewLine, clampContextLines, DEFAULT_DIFF_CONTEXT_LINES } from './unified-diff.js';
import { buildUnifiedRows, lineDiffParts } from './diff-view.js';
import { resolveSource } from './resolver.js';
import { buildVerifyRequest } from './verify-protocol.js';
import { computeChangeDigest } from './ocj1.js';
import { getCorrectionsConfig } from './config.js';
import { createGitSource } from './git-source.js';
import { ByteLru } from './lru.js';
import { createRepoClient } from '../dicta/github-api.js';
import { FakeGitHub } from './testing/fake-github.js';
import { buildMockDecision } from './testing/mock-verify.js';

const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const OLD = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const NEW = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים';

const ctxOf = (content, lineIndex, n = 3) => extractLineContext(splitSourceLines(content), lineIndex, n);
const hunkOf = (content, lineIndex, newLine, n = 3) => {
  const context = ctxOf(content, lineIndex, n);
  return buildLineHunk({ path: PATH, lineIndex, originalLine: context ? splitSourceLines(content).lines[lineIndex].text : null, newLine, context });
};

test('diff: שורה באמצע — 3 שורות הקשר לכל צד, מספרי שורות 1-based וכותרת @@', () => {
  const lines = ['a1', 'a2', 'a3', 'a4', OLD, 'b1', 'b2', 'b3', 'b4'];
  const d = hunkOf(`${lines.join('\n')}\n`, 4, NEW);
  assert.equal(d.format, 'unified');
  assert.equal(d.context_lines, 3);
  assert.deepEqual(d.hunk, { start_line: 2, line_number: 5, before: ['a2', 'a3', 'a4'], removed: [OLD], added: [NEW], after: ['b1', 'b2', 'b3'], line_ending: 'lf' });
  assert.equal(d.unified, [`--- a/${PATH}`, `+++ b/${PATH}`, '@@ -2,7 +2,7 @@', ' a2', ' a3', ' a4', `-${OLD}`, `+${NEW}`, ' b1', ' b2', ' b3', ''].join('\n'));
});

test('diff: שורה ראשונה ואחרונה בקובץ — ההקשר נחתך בגבול, ובלי סיומת בסוף מסומן כמו ב-git', () => {
  const first = hunkOf(`${OLD}\nx\ny\nz\nw\n`, 0, NEW);
  assert.equal(first.hunk.start_line, 1);
  assert.deepEqual(first.hunk.before, []);
  assert.deepEqual(first.hunk.after, ['x', 'y', 'z']);
  assert.match(first.unified, /\n@@ -1,4 \+1,4 @@\n/);

  const last = hunkOf(`p\nq\n${OLD}`, 2, NEW);
  assert.deepEqual(last.hunk.after, []);
  assert.equal(last.hunk.line_ending, 'none');
  assert.ok(last.unified.endsWith(`-${OLD}\n\\ No newline at end of file\n+${NEW}\n\\ No newline at end of file\n`));

  // השורה האחרונה של הקובץ נמצאת בהקשר שאחרי
  const tail = hunkOf(`${OLD}\nq`, 0, NEW);
  assert.ok(tail.unified.endsWith(' q\n\\ No newline at end of file\n'));
  // קובץ שמסתיים בירידת שורה — בלי סימון
  assert.ok(!hunkOf(`${OLD}\nq\n`, 0, NEW).unified.includes('No newline'));
});

test('diff: CRLF — ה-CR אינו חלק מתוכן השורה; סוג הסיומת מדווח בנפרד', () => {
  const d = hunkOf(`<h1>בראשית</h1>\r\n\r\n${OLD}\r\nסוף\r\n`, 2, NEW);
  assert.deepEqual(d.hunk.before, ['<h1>בראשית</h1>', '']);
  assert.deepEqual(d.hunk.after, ['סוף']);
  assert.equal(d.hunk.line_ending, 'crlf');
  assert.ok(!d.unified.includes('\r'));
  assert.match(d.unified, /\n@@ -1,4 \+1,4 @@\n <h1>בראשית<\/h1>\n \n-/);
});

test('diff: BOM אינו חלק מהשורה הראשונה, וההצעה מותאמת כמו בחבילת השינוי', () => {
  const content = `\ufeff${OLD}\r\nשורה ב`;
  const d = hunkOf(content, 0, NEW);
  assert.equal(d.hunk.removed[0], OLD);
  assert.equal(committedNewLine({ bomAdjusted: true }, `\ufeff${NEW}`), NEW);
  assert.equal(committedNewLine({ bomAdjusted: false }, `\ufeff${NEW}`), `\ufeff${NEW}`);
  assert.equal(committedNewLine({ bomAdjusted: true }, null), null);
});

test('diff: מחיקת כל תוכן השורה — השורה נשארת ריקה בקובץ, לכן יש שורת + ריקה', () => {
  const d = hunkOf(`a\n${OLD}\nb\n`, 1, '');
  assert.deepEqual(d.hunk.added, ['']);
  assert.ok(d.unified.includes(`\n-${OLD}\n+\n b\n`));
});

test('diff: אין הצעה או אין הקשר ממקור שאותר → null', () => {
  assert.equal(hunkOf(`a\n${OLD}\n`, 1, null), null);
  assert.equal(buildLineHunk({ path: PATH, lineIndex: 1, originalLine: OLD, newLine: NEW, context: null }), null);
  // הקשר שאינו שייך לאותה שורה (אינדקס לא עקבי) נדחה ולא מנוחש
  const context = ctxOf(`a\n${OLD}\nb\n`, 1);
  assert.equal(buildLineHunk({ path: PATH, lineIndex: 2, originalLine: OLD, newLine: NEW, context }), null);
  assert.equal(ctxOf('a\nb\n', 5), null);
});

test('diff: קובץ קצר מההקשר ושכנים זהים לשורה — כל שורה פעם אחת, בלי חיפוש לפי תוכן', () => {
  const short = hunkOf(`${OLD}`, 0, NEW);
  assert.deepEqual([short.hunk.before, short.hunk.after], [[], []]);
  assert.match(short.unified, /\n@@ -1 \+1 @@\n/);

  const same = hunkOf(`${OLD}\n${OLD}\n${OLD}\n`, 1, NEW);
  assert.deepEqual(same.hunk.before, [OLD]);
  assert.deepEqual(same.hunk.after, [OLD]);
  assert.equal(same.hunk.line_number, 2);
  assert.match(same.unified, /\n@@ -1,3 \+1,3 @@\n/);
});

test('diff: גודל ההקשר נקבע בהגדרה (ברירת מחדל 3) ונחסם לטווח', () => {
  assert.equal(DEFAULT_DIFF_CONTEXT_LINES, 3);
  assert.equal(getCorrectionsConfig({}).diffContextLines, 3);
  assert.equal(getCorrectionsConfig({ CORRECTIONS_DIFF_CONTEXT_LINES: '5' }).diffContextLines, 5);
  assert.equal(clampContextLines('999'), 50);
  assert.equal(clampContextLines('abc'), 3);
  assert.equal(clampContextLines(0), 0);
  const d = hunkOf('a\nb\nc\nd\ne\n', 2, 'X', 1);
  assert.deepEqual([d.hunk.before, d.hunk.after, d.context_lines], [['b'], ['d'], 1]);
});

// ---------------------------------------------------------------- מודל התצוגה

test('תצוגה: שורות הקשר, שורה שהוסרה ושורה שנוספה עם מספרי שורות מהקובץ', () => {
  const context = ctxOf(`a\nb\n${OLD}\nc\n`, 2);
  const m = buildUnifiedRows({ context, lineIndex: 2, originalLine: OLD, newLine: NEW });
  assert.equal(m.hasFileContext, true);
  assert.deepEqual(m.rows.map((r) => [r.kind, r.lineNumber, r.marker]), [
    ['context', 1, ' '], ['context', 2, ' '], ['removed', 3, '−'], ['added', 3, '+'], ['context', 4, ' '],
  ]);
  // השינוי בתוך השורה מודגש ברמת תו, בלי לפצל אות מהניקוד שלה
  const strongOld = m.rows[2].parts.filter((p) => p.level === 2).map((p) => p.text).join('');
  const strongNew = m.rows[3].parts.filter((p) => p.level === 2).map((p) => p.text).join('');
  assert.equal(strongOld, 'הִ֑');
  assert.equal(strongNew, 'קִ֑');
  assert.equal(m.rows[2].parts.map((p) => p.text).join(''), OLD);
  assert.equal(m.rows[3].parts.map((p) => p.text).join(''), NEW);
  assert.equal(m.canExpand, false);
});

test('תצוגה: בלי הקשר מהקובץ — רק שורות הדיווח, ומסומן שאין הקשר', () => {
  const m = buildUnifiedRows({ context: null, lineIndex: null, originalLine: OLD, newLine: NEW });
  assert.equal(m.hasFileContext, false);
  assert.deepEqual(m.rows.map((r) => [r.kind, r.lineNumber]), [['removed', null], ['added', null]]);
});

test('תצוגה: ללא הצעה — השורה המקורית בלבד, בלי שורת +', () => {
  const context = ctxOf(`a\n${OLD}\nb\n`, 1);
  const m = buildUnifiedRows({ context, lineIndex: 1, originalLine: OLD, newLine: null });
  assert.equal(m.noProposal, true);
  assert.deepEqual(m.rows.map((r) => r.kind), ['context', 'reported', 'context']);
});

test('תצוגה: מחיקה — שורה אדומה ושורה ירוקה ריקה המסומנת כריקה', () => {
  const m = buildUnifiedRows({ context: null, lineIndex: null, originalLine: OLD, newLine: '' });
  assert.equal(m.emptied, true);
  assert.deepEqual(m.rows.map((r) => [r.kind, r.parts.length]), [['removed', 1], ['added', 0]]);
  assert.equal(m.rows[0].parts[0].level, 2);
});

test('תצוגה: אפשר להרחיב הקשר רק כשיש עוד שורות בקובץ', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `l${i}`);
  const m = buildUnifiedRows({ context: ctxOf(lines.join('\n'), 10), lineIndex: 10, originalLine: 'l10', newLine: 'X' });
  assert.equal(m.canExpand, true);
});

test('lineDiffParts: טקסט זהה → חלק אחד ברמה 0; תגיות HTML נשארות טקסט', () => {
  const p = lineDiffParts('<b>א</b>', '<b>א</b>');
  assert.deepEqual(p.removed, [{ text: '<b>א</b>', level: 0 }]);
});

// ---------------------------------------------------------------- resolver + חוזה B

const REPO = 'Otzaria/otzaria-library';
const FILE = `\ufeff<h1>בראשית</h1>\r\n\r\n${OLD}\r\n(ב) וְהָאָ֗רֶץ\r\nשורה אחרונה בלי סיומת`;
const report = {
  _id: 'rep1', reportId: 'c1', workflowGeneration: 2, reportKind: 'text_correction', bookTitle: 'בראשית', currentRef: 'בראשית א', sourceFolder: 'ToratEmetToOtzaria',
  filePath: 'אוצריא/תנך/תורה/בראשית.txt', sourceHint: { sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath: 'אוצריא/תנך/תורה/בראשית.txt' }, location: { lineIndex: 2 },
};
const rev = { revision: 1, originalLine: OLD, originalSelection: 'אֱלֹהִ֑ים', proposedText: 'אֱלֹקִ֑ים', contextBefore: '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א ', contextAfter: '' };

async function resolve(over = {}, contextLines) {
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const client = createRepoClient({ repo: REPO, token: 't', fetchImpl: gh.fetch });
  const git = createGitSource({ client, ref: 'main', cache: new ByteLru(1 << 20) });
  return resolveSource({ report, revision: { ...rev, ...over }, gitSource: git, source: { repo: REPO, ref: 'main' }, contextLines });
}

test('resolver: מקור שאותר בדיוק מחזיר הקשר מאותו blob; מקור לא ודאי — בלי הקשר', async () => {
  const s = await resolve();
  assert.equal(s.status, 'exact');
  assert.deepEqual(s.context, { contextLines: 3, firstLineIndex: 0, before: ['<h1>בראשית</h1>', ''], after: ['(ב) וְהָאָ֗רֶץ', 'שורה אחרונה בלי סיומת'], lineCount: 5, finalNewline: false, lineEnding: 'crlf' });
  assert.equal((await resolve({}, 1)).context.before.length, 1);
  const changed = await resolve({ originalLine: `${OLD} שונה` });
  assert.notEqual(changed.status, 'exact');
  assert.equal(changed.context ?? null, null);
});

test('חוזה B: הבקשה נושאת diff מאותו blob, וה-change_digest אינו תלוי בו', async () => {
  const source = await resolve();
  const req = buildVerifyRequest({ report, revision: rev, requestId: 'req_1', requestedScope: 'technical_only', source });
  assert.equal(req.diff.format, 'unified');
  assert.deepEqual(req.diff.hunk.removed, [source.currentLine]);
  assert.deepEqual(req.diff.hunk.added, [NEW]);
  assert.equal(req.diff.hunk.line_number, source.lineIndex + 1);
  assert.match(req.diff.unified, /^--- a\/ToratEmetToOtzaria\/ספרים\/אוצריא\/תנך\/תורה\/בראשית\.txt\n\+\+\+ b\//);
  // ה-digest נגזר רק מהשדות של §4.1 — אותו ערך עם diff ובלעדיו
  const digest = computeChangeDigest({ path: source.path, base_blob_sha: source.blobSha, line_index: source.lineIndex, original_line: source.currentLine, new_line: NEW });
  const noDiff = buildVerifyRequest({ report, revision: rev, requestId: 'req_1', requestedScope: 'technical_only', source: { ...source, context: undefined } });
  assert.equal(noDiff.diff, null);
  assert.equal(computeChangeDigest({ path: noDiff.source.path, base_blob_sha: noDiff.source.blob_sha, line_index: noDiff.source.line_index, original_line: noDiff.source.current_line, new_line: NEW }), digest);

  // שירות הדמה מקבל את ה-diff ומחזיר את כותרת ה-hunk ב-message (תצוגה בלבד)
  assert.equal(buildMockDecision(req).message, 'mock · diff @@ -1,5 +1,5 @@');
  assert.equal(buildMockDecision(noDiff).message, 'mock · no diff');

  assert.equal(buildVerifyRequest({ report, revision: { ...rev, proposedText: null }, requestId: 'r', requestedScope: 'technical_only', source }).diff, null);
  assert.equal(buildVerifyRequest({ report, revision: rev, requestId: 'r', requestedScope: 'technical_only', source: null }).diff, null);
  assert.equal(buildVerifyRequest({ report, revision: rev, requestId: 'r', requestedScope: 'technical_only', source: { ...source, status: 'source_changed' } }).diff, null);
});
