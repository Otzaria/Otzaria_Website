/**
 * בדיקות איתור המקור והפרסום מול GitHub מדומה (ללא רשת). הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSourceLines, joinSourceLines, applyLineChange } from './source-text.js';
import { resolveSource, matchLine, candidatePaths, isAllowedRepoPath, comparableSegment } from './resolver.js';
import { createGitSource, gitBlobShaOfBytes } from './git-source.js';
import { ByteLru } from './lru.js';
import { publishChange, reconcilePublish, prBranchName, sanitizePublicText, PublishConflict } from './publisher.js';
import { computeChangeDigest } from './ocj1.js';
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
  assert.deepEqual(candidatePaths({ sourceFolder: 'X', libraryRelativePath: 'אוצריא/../../etc/passwd.txt' }), []);
  assert.deepEqual(candidatePaths({ sourceFolder: '../x', libraryRelativePath: 'אוצריא/a.txt' }), []);
  assert.equal(isAllowedRepoPath(PATH), true);
  assert.equal(isAllowedRepoPath('ToratEmetToOtzaria/ספרים/אוצריא/../../.github/workflows/x.txt'), false);
  assert.equal(isAllowedRepoPath('.github/workflows/deploy.yml'), false);
  assert.equal(isAllowedRepoPath('sefariaToOtzaria/sefaria_export/ספרים/אוצריא/x.txt'), false);
  // תיקיית ספריא אינה יעד כתיבה גם בנתיב הספרים הרגיל (בחירה ידנית / רמז מלקוח).
  assert.equal(isAllowedRepoPath('sefariaToOtzaria/ספרים/אוצריא/x.txt'), false);
  assert.equal(isAllowedRepoPath('wikiSource/ספרים/אוצריא/x.txt'), true);
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

test('resolver: נתיב שה-DB איית אחרת (שו״ת מול התיקייה שות) נמצא לפי שמות התיקיות בפועל', async () => {
  const repoPath = 'DictaToOtzaria/ערוך/ספרים/אוצריא/שות/אחרונים/בית הלוי/בית הלוי חלק א.txt';
  const { gh, git } = setup({ [repoPath]: FILE, 'DictaToOtzaria/ערוך/ספרים/אוצריא/שות/אחרונים/אחר.txt': 'x' });
  const dicta = (libraryRelativePath) => report({ sourceFolder: 'DictaToOtzaria', filePath: libraryRelativePath, sourceHint: { sourceFolder: 'DictaToOtzaria', libraryRelativePath } });
  const r = await resolveSource({ report: dicta('אוצריא/שו״ת/אחרונים/בית הלוי/בית הלוי חלק א.txt'), revision: rev(), gitSource: git, source: { repo: REPO, ref: 'main' } });
  assert.equal(r.status, 'exact');
  assert.equal(r.path, repoPath);
  assert.equal(r.pathMatch, 'normalized');
  assert.equal(r.blobSha, gh.fileSha('main', repoPath));
  // נתיב שקיים כלשונו לא עובר דרך הנרמול
  const direct = await resolveSource({ report: report(), revision: rev(), gitSource: setup().git, source: { repo: REPO, ref: 'main' } });
  assert.equal(direct.pathMatch, 'exact');
});

test('resolver: רמז של שם קובץ בלבד (בלי נתיב קטגוריה) נמצא בכל עומק תחת תיקיית המקור', async () => {
  const deep = 'ToratEmetToOtzaria/ספרים/אוצריא/תלמוד בבלי/מפרשים/חברותא על ברכות.txt';
  const bare = (libraryRelativePath, sourceFolder = 'ToratEmetToOtzaria') => report({ sourceFolder, filePath: libraryRelativePath, sourceHint: { sourceFolder, libraryRelativePath } });
  const one = setup({ [deep]: FILE, 'ToratEmetToOtzaria/ספרים/אוצריא/תלמוד בבלי/ברכות.txt': 'x' });
  const r = await resolveSource({ report: bare('חברותא על ברכות.txt'), revision: rev(), gitSource: one.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(r.status, 'exact');
  assert.equal(r.path, deep);
  assert.equal(r.pathMatch, 'filename');
  assert.equal(r.blobSha, one.gh.fileSha('main', deep));

  // שם זהה אחרי נרמול בלבד (מירכאות) — נמצא כשהוא יחיד
  const quoted = setup({ 'ToratEmetToOtzaria/ספרים/אוצריא/שות/שו"ת הרשב"א.txt': FILE });
  const q = await resolveSource({ report: bare('שו״ת הרשב״א.txt'), revision: rev(), gitSource: quoted.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(q.status, 'exact');

  // אותו שם בשתי קטגוריות — עמום, המועמדים לבחירה ידנית
  const twice = setup({ [deep]: FILE, 'ToratEmetToOtzaria/ספרים/אוצריא/אחר/חברותא על ברכות.txt': FILE });
  const a = await resolveSource({ report: bare('חברותא על ברכות.txt'), revision: rev(), gitSource: twice.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(a.status, 'ambiguous');
  assert.equal(a.candidates.length, 2);

  // לא קיים / עץ שנחתך / תיקייה שאינה יעד כתיבה — לא נמצא
  const missing = await resolveSource({ report: bare('אין כזה.txt'), revision: rev(), gitSource: one.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(missing.status, 'not_found');
  const cut = setup({ [deep]: FILE });
  cut.gh.truncateTrees = true;
  const t = await resolveSource({ report: bare('חברותא על ברכות.txt'), revision: rev(), gitSource: cut.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(t.status, 'not_found');
  const sefaria = await resolveSource({ report: bare('חברותא על ברכות.txt', 'Sefaria'), revision: rev(), gitSource: one.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(sefaria.reason, 'no_candidate_path');
});

test('resolver: מירכאות בשם הספר ותלמוד ירושלים/ירושלמי נמצאים; שני מועמדים אחרי נרמול נשארים ידניים', async () => {
  const quoted = 'ToratEmetToOtzaria/ספרים/אוצריא/תלמוד ירושלים/חידושי הרשב"א.txt';
  const one = setup({ [quoted]: FILE });
  const hinted = (libraryRelativePath) => report({ filePath: libraryRelativePath, sourceHint: { sourceFolder: 'ToratEmetToOtzaria', libraryRelativePath } });
  const r = await resolveSource({ report: hinted('אוצריא/תלמוד ירושלמי/חידושי הרשב״א.txt'), revision: rev(), gitSource: one.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(r.path, quoted);
  assert.equal(r.status, 'exact');

  const two = setup({
    'ToratEmetToOtzaria/ספרים/אוצריא/שות/ספר.txt': FILE,
    'ToratEmetToOtzaria/ספרים/אוצריא/שו"ת/ספר.txt': FILE,
  });
  const a = await resolveSource({ report: hinted('אוצריא/שו״ת/ספר.txt'), revision: rev(), gitSource: two.git, source: { repo: REPO, ref: 'main' } });
  assert.equal(a.status, 'not_found');
  assert.equal(a.reason, 'file_missing_in_repo');
});

test('comparableSegment מתעלם מסוגי מירכאות וגרשיים בלבד', () => {
  assert.equal(comparableSegment('שו״ת'), comparableSegment('שות'));
  assert.equal(comparableSegment('תנ"ך'), comparableSegment('תנ״ך'));
  assert.equal(comparableSegment("רמב''ן"), comparableSegment('רמב״ן'));
  assert.equal(comparableSegment('תלמוד ירושלים'), comparableSegment('תלמוד ירושלמי'));
  assert.notEqual(comparableSegment('בראשית (חדש).txt'), comparableSegment('בראשית.txt'));
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

// הביקורת (#312): אחרי אישור תקף הפסקה זזה, ובאינדקס הישן שורה זהה מפסקה אחרת — המקור (ישיר) או ההצעה (PR).
const OLDP = 'באמצע הפסקה הייחודית נשארה המילה השגיאה ויש עוד מה להגיה';
const NEWP = OLDP.replace('השגיאה', 'השגחה');
const PBASE = ['הקדמת המחבר', 'הכרעת חכמים בעניין זה', OLDP, 'ועתה ראו חידוש נפלא', 'סיום הספר'].join('\n');
const moved = (impostor) => ['הקדמת המחבר', 'אמרות מפרק אחר', impostor, 'תוספות', 'הכרעת חכמים בעניין זה', OLDP, 'ועתה ראו חידוש נפלא', 'סיום הספר'].join('\n');
const pubChange = (gh) => changeFor(gh, { lineIndex: 2, originalLine: OLDP, newLine: NEWP });

for (const [mode, impostor] of [['direct', OLDP], ['pr', NEWP]]) {
  test(`הביקורת (${mode}): הפסקה זזה ובאינדקס הישן שורה זהה מפסקה אחרת → PublishConflict(source_not_resolved), בלי כתיבה ובלי "כבר תוקן"`, async () => {
    const { gh, client } = setup({ [PATH]: PBASE });
    const change = pubChange(gh);
    gh.pushExternal('main', { [PATH]: moved(impostor) });
    const head = gh.headSha('main');
    await assert.rejects(
      publishChange({ client, target: { branch: 'main', mode, maxRefRetries: 3 }, change, report: report(), attemptId: `pa_rv_${mode}` }),
      (e) => e instanceof PublishConflict && e.reason === 'source_not_resolved' && e.details.target === 'target_ambiguous',
    );
    assert.equal(gh.headSha('main'), head);
    assert.equal(gh.readFile('main', PATH), moved(impostor), 'השורה מהפסקה האחרת לא נערכה');
    assert.equal(gh.calls.filter((c) => c.method !== 'GET').length, 0);
  });
}

test('קובץ שהשתנה: הפסקה המדווחת היחידה זזה → הכתיבה במקום שאותר; תוקנה במקום אחר → already_fixed רק לפי האיתור', async () => {
  const { gh, client } = setup({ [PATH]: PBASE });
  const change = pubChange(gh);
  const shiftedLines = ['שורה חדשה בראש', ...PBASE.split('\n')];
  gh.pushExternal('main', { [PATH]: shiftedLines.join('\n') });
  const out = await publishChange({ client, target: { branch: 'main', mode: 'direct', maxRefRetries: 3 }, change, report: report(), attemptId: 'pa_mv' });
  assert.deepEqual([out.status, out.rebased], ['committed', true]);
  assert.equal(gh.readFile('main', PATH), shiftedLines.map((l) => (l === OLDP ? NEWP : l)).join('\n'));

  const two = setup({ [PATH]: PBASE });
  const change2 = pubChange(two.gh);
  two.gh.pushExternal('main', { [PATH]: ['שורה חדשה בראש', ...PBASE.split('\n').map((l) => (l === OLDP ? NEWP : l))].join('\n') });
  const head = two.gh.headSha('main');
  const fixed = await publishChange({ client: two.client, target: { branch: 'main', mode: 'pr', maxRefRetries: 3 }, change: change2, report: report(), attemptId: 'pa_fx' });
  assert.equal(fixed.status, 'already_fixed');
  assert.equal(two.gh.headSha('main'), head);
});

// הביקורת הרביעית (#312): האישור כלל תיקון מילה וגם שינוי HTML, והמקור קלט רק חלק ממנו. האיתור המנורמל (בלי תגיות)
// מזהה את הפסקה ורואה שהמילה תוקנה, אבל "כבר תוקן" דורש שכל השינוי הגולמי שאושר יימצא בשורה שאותרה.
const TAGP = 'באמצע הפסקה <b>הייחודית</b> נשארה המילה השגיאה ויש עוד מה להגיה';
const TAGNEW = TAGP.replace('<b>הייחודית</b>', 'הייחודית').replace('השגיאה', 'השגחה');
const TAGBASE = ['הקדמת המחבר', 'הכרעת חכמים בעניין זה', TAGP, 'ועתה ראו חידוש נפלא', 'סיום הספר'];
// המקור אחרי האישור: שורה חדשה בראש הקובץ (הפסקה זזה), והפסקה המדווחת כפי שנקלטה
const tagMain = (...para) => ['שורה חדשה בראש', ...TAGBASE.flatMap((l) => (l === TAGP ? para : [l]))].join('\n');
const publishTagged = async (mode, main, attemptId) => {
  const { gh, client } = setup({ [PATH]: TAGBASE.join('\n') });
  const change = changeFor(gh, { lineIndex: 2, originalLine: TAGP, newLine: TAGNEW });
  gh.pushExternal('main', { [PATH]: main });
  const head = gh.headSha('main');
  const run = () => publishChange({ client, target: { branch: 'main', mode, maxRefRetries: 3 }, change, report: report(), attemptId });
  return { gh, head, run };
};

test('הביקורת הרביעית: המקור קלט רק חלק מהשינוי שאושר (המילה בלי ה-HTML, או להפך) → PublishConflict(source_changed), בלי כתיבה ובלי "כבר תוקן"', async () => {
  const partial = {
    'רק המילה': TAGP.replace('השגיאה', 'השגחה'),
    'המילה ותגית אחרת': TAGP.replace('<b>הייחודית</b>', '<i>הייחודית</i>').replace('השגיאה', 'השגחה'),
    'רק ה-HTML': TAGP.replace('<b>הייחודית</b>', 'הייחודית'),
    'המילה, ופסקה שפוצלה לשתי שורות': TAGNEW.replace(' המילה', '\nהמילה'),
  };
  for (const mode of ['direct', 'pr']) {
    for (const [label, para] of Object.entries(partial)) {
      const { gh, head, run } = await publishTagged(mode, tagMain(...para.split('\n')), `pa_part_${mode}`);
      await assert.rejects(run(), (e) => e instanceof PublishConflict && e.reason === 'source_changed', `${mode}: ${label}`);
      assert.equal(gh.headSha('main'), head, `${mode}: ${label}`);
      assert.equal(gh.calls.filter((c) => c.method !== 'GET').length, 0, `${mode}: ${label}`);
    }
  }
});

test('הביקורת הרביעית: שורה זהה להצעה במקום שאותר אינה מספיקה — עותק של הפסקה שבו המילה תוקנה והתגיות לא → PublishConflict', async () => {
  const wordOnly = TAGP.replace('השגיאה', 'השגחה');
  const variants = {
    // פיתיון זהה להצעה במקום הישן, והפסקה המדווחת זזה לסוף הקובץ (עם תוספת בראשה) — המילה תוקנה, התגיות לא
    'פיתיון במקום הישן': [TAGBASE.join('\n'), [...TAGBASE.map((l) => (l === TAGP ? TAGNEW : l)), `תוספת: ${wordOnly}`].join('\n')],
    // תאום שכבר היה תקין בבסיס, והפסקה המדווחת קלטה רק את המילה
    'תאום תקין מהבסיס': [[...TAGBASE, TAGNEW].join('\n'), ['שורה חדשה בראש', ...TAGBASE.map((l) => (l === TAGP ? wordOnly : l)), TAGNEW].join('\n')],
  };
  for (const mode of ['direct', 'pr']) {
    for (const [label, [base, main]] of Object.entries(variants)) {
      const { gh, client } = setup({ [PATH]: base });
      const change = changeFor(gh, { lineIndex: 2, originalLine: TAGP, newLine: TAGNEW });
      gh.pushExternal('main', { [PATH]: main });
      const head = gh.headSha('main');
      const run = publishChange({ client, target: { branch: 'main', mode, maxRefRetries: 3 }, change, report: report(), attemptId: `pa_decoy_${mode}` });
      await assert.rejects(run, (e) => e instanceof PublishConflict && e.reason === 'source_changed', `${mode}: ${label}`);
      assert.equal(gh.headSha('main'), head, `${mode}: ${label}`);
    }
  }
});

test('הביקורת הרביעית: כל השינוי הגולמי שאושר נקלט — ההצעה עצמה, או העריכה בהקשרה לצד תיקון אחר באותה שורה → already_fixed', async () => {
  const taken = { 'ההצעה עצמה': TAGNEW, 'לצד תיקון אחר בסוף השורה': TAGNEW.replace('להגיה', 'להגהה') };
  for (const mode of ['direct', 'pr']) {
    for (const [label, para] of Object.entries(taken)) {
      const { gh, head, run } = await publishTagged(mode, tagMain(para), `pa_full_${mode}`);
      assert.equal((await run()).status, 'already_fixed', `${mode}: ${label}`);
      assert.equal(gh.headSha('main'), head, `${mode}: ${label}`);
    }
  }
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
