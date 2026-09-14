/**
 * בדיקות איתור המקור והפרסום מול GitHub מדומה (ללא רשת). הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSourceLines, joinSourceLines, applyLineChange } from './source-text.js';
import { resolveSource, matchLine, candidatePaths, isAllowedRepoPath, routeSourceKind } from './resolver.js';
import { createGitSource, gitBlobShaOfBytes } from './git-source.js';
import { ByteLru } from './lru.js';
import { publishChange, reconcilePublish, prBranchName, sanitizePublicText, PublishConflict } from './publisher.js';
import { buildExternalSefariaPackage } from './external.js';
import { sha256Hex, computeChangeDigest } from './ocj1.js';
import { createRepoClient } from '../dicta/github-api.js';
import { FakeGitHub } from './testing/fake-github.js';

const REPO = 'Otzaria/otzaria-library';
const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const L0 = '<h1>בראשית</h1>';
const L2 = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const NEW2 = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים';
const FILE = `\ufeff${L0}\r\n\r\n${L2}\r\n(ב) וְהָאָ֗רֶץ\r\nשורה אחרונה בלי סיומת`;

function setup(files = { [PATH]: FILE }) {
  const gh = new FakeGitHub({ repo: REPO, files });
  const client = createRepoClient({ repo: REPO, token: 't', fetchImpl: gh.fetch });
  return { gh, client, git: createGitSource({ client, ref: 'main', cache: new ByteLru(1 << 20) }) };
}

const report = (over = {}) => ({
  _id: 'rep1', bookTitle: 'בראשית', currentRef: 'בראשית א', sourceFolder: 'ToratEmetToOtzaria', filePath: 'אוצריא/תנך/תורה/בראשית.txt',
  sourceHint: { sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath: 'אוצריא/תנך/תורה/בראשית.txt' }, location: { lineIndex: 2 }, ...over,
});
const rev = (over = {}) => ({ revision: 1, originalLine: L2, originalSelection: 'אֱלֹהִ֑ים', proposedText: 'אֱלֹקִ֑ים', contextBefore: '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א ', contextAfter: '', ...over });

test('[T4] פירוק/שחזור שומר BOM, CRLF לכל שורה ושורה אחרונה בלי סיומת — בייט-לבייט', () => {
  const parsed = splitSourceLines(FILE);
  assert.equal(parsed.bom, true);
  assert.equal(parsed.lines[2].text, L2);
  assert.equal(parsed.lines[2].eol, '\r\n');
  assert.equal(joinSourceLines(parsed), FILE);
  const applied = applyLineChange(FILE, 2, L2, NEW2);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.content, FILE.replace(L2, NEW2));
  assert.equal(Buffer.from(applied.content, 'utf8').subarray(0, 3).toString('hex'), 'efbbbf');
});

test('[T22] טקסט חוזר: שינוי רק בשורה לפי אינדקס, לא החלפה גלובלית', () => {
  const dup = 'אותה שורה\nאחרת\nאותה שורה\n';
  const r = applyLineChange(dup, 2, 'אותה שורה', 'שורה מתוקנת');
  assert.equal(r.content, 'אותה שורה\nאחרת\nשורה מתוקנת\n');
  assert.equal(matchLine(dup, { originalLine: 'אותה שורה', lineIndex: 2 }).status, 'exact');
  assert.equal(matchLine(dup, { originalLine: 'אותה שורה', lineIndex: 1 }).status, 'ambiguous');
  assert.equal(matchLine(dup, { originalLine: 'אותה שורה', lineIndex: null }).status, 'ambiguous');
});

test('מיפוי נתיבים: רמז הופך לנתיב Git מועמד בלבד; traversal ונתיב לא מורשה נדחים', () => {
  assert.deepEqual(candidatePaths({ sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath: 'אוצריא/תנך/תורה/בראשית.txt' }), [PATH]);
  assert.deepEqual(candidatePaths({ sourceFolder: 'DictaToOtzaria', libraryRelativePath: 'אוצריא/א.txt' }), ['DictaToOtzaria/ערוך/ספרים/אוצריא/א.txt']);
  assert.deepEqual(candidatePaths({ sourceFolder: 'sefariaToOtzaria', libraryRelativePath: 'אוצריא/א.txt' }), []);
  assert.deepEqual(candidatePaths({ sourceFolder: 'X', libraryRelativePath: 'אוצריא/../../etc/passwd.txt' }), []);
  assert.deepEqual(candidatePaths({ sourceFolder: '../x', libraryRelativePath: 'אוצריא/a.txt' }), []);
  assert.equal(isAllowedRepoPath(PATH), true);
  assert.equal(isAllowedRepoPath('ToratEmetToOtzaria/ספרים/אוצריא/../../.github/workflows/x.txt'), false);
  assert.equal(isAllowedRepoPath('.github/workflows/deploy.yml'), false);
  assert.equal(isAllowedRepoPath('sefariaToOtzaria/sefaria_export/ספרים/אוצריא/x.txt'), false);
});

test('[T22] resolver: התאמה מדויקת עם BOM ו-CRLF, והמטמון לפי blob sha מונע הורדה חוזרת', async () => {
  const { gh, git } = setup();
  const r1 = await resolveSource({ report: report(), revision: rev(), gitSource: git, source: { repo: REPO, ref: 'main' } });
  assert.equal(r1.status, 'exact');
  assert.equal(r1.lineIndex, 2);
  assert.equal(r1.currentLine, L2);
  assert.equal(r1.blobSha, gh.fileSha('main', PATH));
  const blobCalls = () => gh.calls.filter((c) => c.path.includes('/git/blobs/')).length;
  const before = blobCalls();
  await resolveSource({ report: report(), revision: rev(), gitSource: git, source: { repo: REPO, ref: 'main' } });
  assert.equal(blobCalls(), before);
});

test('[T22] resolver: מקור חסר / קובץ ששמו השתנה → not_found (ידני), שורה שהשתנתה → source_changed, מועמדים fuzzy בלבד', async () => {
  const renamed = setup({ ['ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית (חדש).txt']: FILE });
  const r = await resolveSource({ report: report(), revision: rev(), gitSource: renamed.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(r.status, 'not_found');
  const changed = setup({ [PATH]: FILE.replace(L2, `${L2} `) });
  const c = await resolveSource({ report: report(), revision: rev(), gitSource: changed.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(c.status, 'source_changed');
  assert.equal(c.match, 'unique_normalized');
  assert.ok(c.candidates.length >= 1);
  const moved = setup({ [PATH]: `שורה חדשה\n${FILE}` });
  const m = await resolveSource({ report: report(), revision: rev(), gitSource: moved.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(m.status, 'relocated');
  assert.equal(m.lineIndex, 3);
});

test('[T23] resolver מזהה שהתיקון כבר הוחל במקום הנכון בלבד', async () => {
  const fixed = setup({ [PATH]: FILE.replace(L2, NEW2) });
  const r = await resolveSource({ report: report(), revision: rev(), gitSource: fixed.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(r.status, 'already_applied');
  const elsewhere = setup({ [PATH]: `${FILE}\n${NEW2}`.replace(`${L2}\r\n`, 'אחרת\r\n') });
  const e = await resolveSource({ report: report(), revision: rev(), gitSource: elsewhere.git, source: { repo: REPO, ref: 'main' } });
  assert.notEqual(e.status, 'already_applied');
});

test('ספרי ספריא → external_handling (לא נתיב Git), ושאר המקורות לא מושפעים', async () => {
  assert.equal(routeSourceKind(report({ sourceFolder: 'sefariaToOtzaria', sourceHint: null })), 'external_handling');
  assert.equal(routeSourceKind(report({ sourceFolder: 'Sefaria' })), 'external_handling');
  assert.equal(routeSourceKind(report({ sourceHint: { sourceName: 'Sefaria', sourceFolder: 'x' } })), 'external_handling');
  assert.equal(routeSourceKind(report()), 'repo');
  const { gh, git } = setup();
  const r = await resolveSource({ report: report({ sourceFolder: 'sefariaToOtzaria', sourceHint: null }), revision: rev(), gitSource: git, source: { repo: REPO, ref: 'main' } });
  assert.equal(r.status, 'external_handling');
  assert.equal(gh.calls.length, 0);
});

test('חבילה חיצונית לספריא מכילה את שדות המאתר, בלי פורמט מחולל ממוצא', () => {
  const r = report({ sourceFolder: 'sefariaToOtzaria', reportId: 'c1', currentRevision: 1, libraryVersion: '27', location: { lineIndex: 4, libraryBuildId: '28' }, proposals: [rev()] });
  const p = buildExternalSefariaPackage(r);
  assert.equal(p.external_target, 'sefaria_generator');
  assert.equal(p.generator_format, null);
  assert.equal(p.book_title, 'בראשית');
  assert.equal(p.he_ref, 'בראשית א');
  assert.equal(p.he_ref_stable, false);
  assert.equal(p.db_line_index, 4);
  assert.equal(p.library_version, '28');
  assert.equal(p.original_line, L2);
  assert.equal(p.original_line_sha256, sha256Hex(L2));
  assert.equal(p.new_line, NEW2);
  assert.deepEqual(Object.keys(p).includes('selection_offset'), true);
  assert.equal(p.report_id, 'rep1');
  const free = buildExternalSefariaPackage(report({ sourceFolder: 'Sefaria', proposals: undefined }));
  assert.equal(free.new_line, null);
  assert.equal(free.original_line_sha256, null);
});

function changeFor(gh, over = {}) {
  const c = { path: PATH, baseBlobSha: gh.fileSha('main', PATH), baseCommitSha: gh.headSha('main'), lineIndex: 2, originalLine: L2, newLine: NEW2, ...over };
  c.changeDigest = computeChangeDigest({ path: c.path, base_blob_sha: c.baseBlobSha, line_index: c.lineIndex, original_line: c.originalLine, new_line: c.newLine });
  return c;
}

test('פרסום direct: קומיט יחיד עם parent=head, force:false, והקובץ שמור בייט-לבייט מלבד השורה', async () => {
  const { gh, client } = setup();
  const head0 = gh.headSha('main');
  const out = await publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change: changeFor(gh), report: report(), attemptId: 'pa_1', authority: 'volunteer' });
  assert.equal(out.status, 'committed');
  assert.equal(gh.readFile('main', PATH), FILE.replace(L2, NEW2));
  assert.deepEqual(gh.commits.get(out.commitSha).parents, [head0]);
  assert.ok(gh.calls.some((c) => c.method === 'PATCH' && c.body.force === false));
  assert.match(gh.commits.get(out.commitSha).message, /Publish-Attempt: pa_1/);
});

test('[T21] שינוי לא קשור באותו קובץ בין הבסיס לפרסום → פרסום על ה-head החדש, השינוי הזר נשמר', async () => {
  const { gh, client } = setup();
  const change = changeFor(gh);
  gh.pushExternal('main', { [PATH]: FILE.replace('שורה אחרונה בלי סיומת', 'שורה אחרונה ערוכה') });
  const out = await publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change, report: report(), attemptId: 'pa_2' });
  assert.equal(out.status, 'committed');
  assert.equal(out.rebased, true);
  assert.equal(gh.readFile('main', PATH), FILE.replace(L2, NEW2).replace('שורה אחרונה בלי סיומת', 'שורה אחרונה ערוכה'));
});

test('[T21][T20] שינוי בקטע עצמו → PublishConflict, בלי קומיט', async () => {
  const { gh, client } = setup();
  const change = changeFor(gh);
  gh.pushExternal('main', { [PATH]: FILE.replace(L2, `${L2} [תיקון אחר]`) });
  const head = gh.headSha('main');
  await assert.rejects(
    publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change, report: report(), attemptId: 'pa_3' }),
    (e) => e instanceof PublishConflict && e.reason === 'source_changed',
  );
  assert.equal(gh.headSha('main'), head);
});

test('ענף שהתקדם בין הקריאה ל-PATCH → 422 → קריאה ואימות מחדש, בלי לשלב בסיס ישן', async () => {
  const { gh, client } = setup();
  let raced = false;
  gh.hooks.beforeRequest = async ({ method }) => {
    if (method === 'PATCH' && !raced) {
      raced = true;
      gh.pushExternal('main', { 'ToratEmetToOtzaria/ספרים/אוצריא/אחר.txt': 'קובץ אחר' });
    }
  };
  const out = await publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change: changeFor(gh), report: report(), attemptId: 'pa_4' });
  assert.equal(out.status, 'committed');
  assert.equal(gh.readFile('main', 'ToratEmetToOtzaria/ספרים/אוצריא/אחר.txt'), 'קובץ אחר');
  assert.equal(gh.readFile('main', PATH), FILE.replace(L2, NEW2));
  assert.equal(gh.calls.filter((c) => c.method === 'PATCH').length, 2);
});

test('[T23] תיקון שכבר קיים בענף היעד → already_fixed בלי קומיט', async () => {
  const { gh, client } = setup({ [PATH]: FILE.replace(L2, NEW2) });
  const head = gh.headSha('main');
  const out = await publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change: changeFor(gh, { originalLine: L2 }), report: report(), attemptId: 'pa_5' });
  assert.equal(out.status, 'already_fixed');
  assert.equal(gh.headSha('main'), head);
  assert.equal(gh.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('פרסום PR: ענף מבודד לכל ניסיון, PR פתוח ≠ מוזג, והענף הראשי לא השתנה', async () => {
  const { gh, client } = setup();
  const head = gh.headSha('main');
  const out = await publishChange({ client, target: { branch: 'main', mode: 'pr', maxRefRetries: 3 }, change: changeFor(gh), report: report(), attemptId: 'pa_6' });
  assert.equal(out.status, 'pr_opened');
  assert.equal(out.branch, prBranchName('rep1', 'pa_6'));
  assert.equal(gh.headSha('main'), head);
  assert.equal(gh.pulls[0].state, 'open');
  assert.equal(gh.readFile(out.branch, PATH), FILE.replace(L2, NEW2));
});

test('[T24] reconciliation לפי publish_attempt_id מוצא קומיט/PR קיים בלי כתיבה נוספת', async () => {
  const { gh, client } = setup();
  const change = changeFor(gh);
  await publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change, report: report(), attemptId: 'pa_7' });
  const writes = gh.calls.filter((c) => c.method !== 'GET').length;
  const rec = await reconcilePublish({ client, target: { branch: 'main', mode: 'direct' }, report: report(), attemptId: 'pa_7', change });
  assert.equal(rec.status, 'committed');
  assert.equal(gh.calls.filter((c) => c.method !== 'GET').length, writes);
  const miss = await reconcilePublish({ client, target: { branch: 'main', mode: 'direct' }, report: report(), attemptId: 'pa_nope', change });
  assert.equal(miss.status, 'not_found');

  const p = setup();
  const pc = changeFor(p.gh);
  await publishChange({ client: p.client, target: { branch: 'main', mode: 'pr', maxRefRetries: 3 }, change: pc, report: report(), attemptId: 'pa_8' });
  const prRec = await reconcilePublish({ client: p.client, target: { branch: 'main', mode: 'pr' }, report: report(), attemptId: 'pa_8', change: pc });
  assert.equal(prRec.status, 'pr_opened');
  assert.equal(p.gh.pulls.length, 1);
});

test('[T26] אין מידע פרטי בקומיט/PR; נתיב לא מורשה נחסם לפני כל כתיבה', async () => {
  assert.equal(sanitizePublicText('ספר user@example.com C:\\Users\\me\\x.txt'), 'ספר [הוסר] [הוסר]');
  const { gh, client } = setup();
  const out = await publishChange({
    client, target: { branch: 'main', mode: 'pr', maxRefRetries: 3 }, change: changeFor(gh),
    report: report({ bookTitle: 'בראשית user@example.com', errorDetails: 'פרטי קשר 050-0000000', senderEmail: 'user@example.com' }), attemptId: 'pa_9',
  });
  const pr = gh.pulls[0];
  const msg = gh.commits.get(out.commitSha).message;
  for (const s of [pr.title, pr.body, msg]) {
    assert.equal(s.includes('user@example.com'), false);
    assert.equal(s.includes('050-0000000'), false);
  }
  const writesBefore = gh.calls.filter((c) => c.method !== 'GET').length;
  await assert.rejects(
    publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change: changeFor(gh, { path: '.github/workflows/deploy.txt' }), report: report(), attemptId: 'pa_10' }),
    (e) => e.reason === 'path_not_allowed',
  );
  assert.equal(gh.calls.filter((c) => c.method !== 'GET').length, writesBefore);
});

test('git source מאמת את תקינות ה-blob ומזהה קובץ שאינו UTF-8', async () => {
  const bad = Buffer.from([0xff, 0xfe, 0x41]);
  const { git } = setup({ ['X/ספרים/אוצריא/bad.txt']: bad });
  const head = await git.getHead();
  const f = await git.getFile('X/ספרים/אוצריא/bad.txt', head.commitSha);
  assert.equal(f.lossy, true);
  assert.equal(f.blobSha, gitBlobShaOfBytes(bad));
});
