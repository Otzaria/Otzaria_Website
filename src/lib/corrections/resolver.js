/**
 * איתור מקור הדיווח במאגר otzaria-library (CONTRACT §1.1). כל רמז מהלקוח הוא לא
 * מהימן: הנתיב מחושב מחדש, נבדק מול הריפו, והשורה מותאמת בדיוק. ספק = ידני.
 */
import { splitSourceLines } from './source-text.js';
import { computeNewLine } from './payload.js';
import { extractLineContext, DEFAULT_DIFF_CONTEXT_LINES } from './unified-diff.js';
import { reachesOtzariaInbox } from './report-email.js';
import { lineIndex as indexLines, locateEdit, canon, rawCanon, LOCATE } from './locate-edit.js';
import { rawPartHeld, editState, lineEdit } from './absorption.js';
import { rebaseLineChange } from './rebase-change.js';
import { isDistinctiveLine } from './already-applied.js';

const LIB_PREFIX = 'אוצריא/';
const BOOKS_SEGMENT = 'ספרים/אוצריא';
const FOLDER_RE = /^[A-Za-z0-9_-]{1,100}$/;
const SPECIAL_ROOTS = {
  DictaToOtzaria: ['DictaToOtzaria/ערוך/ספרים/אוצריא'],
};

function safeSegments(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 1000) return null;
  if (rel.startsWith('/') || rel.includes('\\') || rel.includes('//')) return null;
  if (/[\u0000-\u001f\u007f]/.test(rel)) return null;
  const segs = rel.split('/');
  if (segs.some((s) => !s || s === '.' || s === '..' || s.trim() !== s)) return null;
  return segs;
}

export function rootsForFolder(folder) {
  if (typeof folder !== 'string' || !FOLDER_RE.test(folder)) return null;
  // תיקייה שדיווחיה לא מגיעים לאוצריא (ספריא) אינה יעד כתיבה, גם בבחירה ידנית או מרמז.
  if (!reachesOtzariaInbox(folder)) return null;
  return SPECIAL_ROOTS[folder] || [`${folder}/${BOOKS_SEGMENT}`];
}

/** נתיב Git מותר ליעד כתיבה/קריאה: תחת אחד משורשי הספרים, בלי traversal, קבצי txt בלבד. */
export function isAllowedRepoPath(path) {
  const segs = safeSegments(path);
  if (!segs || !path.toLowerCase().endsWith('.txt')) return false;
  const folder = segs[0];
  const roots = rootsForFolder(folder);
  if (!roots) return false;
  return roots.some((r) => path.startsWith(`${r}/`) && path.length > r.length + 1);
}

/** שורשי הספרים בריפו ומקטעי הנתיב היחסי מהרמזים, או null כשהרמזים לא תקינים. */
function hintedLocation({ sourceFolder, libraryRelativePath }) {
  if (typeof libraryRelativePath !== 'string' || !libraryRelativePath.startsWith(LIB_PREFIX)) return null;
  const rest = libraryRelativePath.slice(LIB_PREFIX.length);
  const segs = safeSegments(rest);
  if (!segs || !rest.toLowerCase().endsWith('.txt')) return null;
  const roots = rootsForFolder(sourceFolder);
  return roots ? { roots, rest, segs } : null;
}

/** מועמדי נתיב Git מהרמזים. לעולם אינו מאמת קיום — רק מחשב. */
export function candidatePaths(hints) {
  const loc = hintedLocation(hints);
  if (!loc) return [];
  return loc.roots.map((r) => `${r}/${loc.rest}`).filter(isAllowedRepoPath);
}

// מחולל ה-DB (SeforimLibrary, Generator.kt: normalizeHebrewLabel/normalizeCategorySegments) משנה את
// שמות התיקיות והספרים: מירכאות הופכות לגרשיים, "שות"/"תנך" מקבלים גרשיים, "תלמוד ירושלים" הופך
// ל"תלמוד ירושלמי". הנתיב שהאפליקציה שולחת הוא של ה-DB, ולכן בריפו התיקייה "שות" ולא "שו״ת".
const SEGMENT_ALIASES = new Map([['תלמוד ירושלים', 'תלמוד ירושלמי']]);

/** מפתח השוואה לשם תיקייה/קובץ: בלי מירכאות, גרשיים וגרש, ורווחים מאוחדים. */
export function comparableSegment(name) {
  const s = name.normalize('NFC').replace(/["״'׳`“”‘’]/g, '').replace(/\s+/g, ' ').trim();
  return SEGMENT_ALIASES.get(s) ?? s;
}

/**
 * הנתיב בריפו לנתיב ספרייה שאויית אחרת (ראו comparableSegment). בכל רמה שם זהה קודם, ואחרת שם
 * יחיד שזהה אחרי נרמול; יותר מאחד או אף אחד = null, כדי שספק יישאר ידני.
 */
export async function findNormalizedPath(gitSource, root, segs, commitSha) {
  let dir = root;
  for (const [i, seg] of segs.entries()) {
    const entries = await gitSource.listDir(dir, commitSha);
    if (!entries) return null;
    const pool = entries.filter((e) => e.type === (i === segs.length - 1 ? 'file' : 'dir'));
    let hit = pool.find((e) => e.name === seg);
    if (!hit) {
      const key = comparableSegment(seg);
      const same = pool.filter((e) => comparableSegment(e.name) === key);
      if (same.length !== 1) return null;
      hit = same[0];
    }
    dir = `${dir}/${hit.name}`;
  }
  return isAllowedRepoPath(dir) ? dir : null;
}

/**
 * רמז שהוא שם קובץ בלבד — האפליקציה לא ידעה את נתיב הקטגוריה של הספר (ספר שנפתח
 * מקישור/חיפוש). מחזיר את שורשי התיקייה ושם הקובץ, או null.
 */
function bareFileHint({ sourceFolder, libraryRelativePath }) {
  const segs = safeSegments(libraryRelativePath);
  if (!segs || segs.length !== 1 || !libraryRelativePath.toLowerCase().endsWith('.txt')) return null;
  const roots = rootsForFolder(sourceFolder);
  return roots ? { roots, name: segs[0] } : null;
}

/**
 * כל הקבצים בשם הזה מתחת לשורשי התיקייה: שם זהה קודם, ואחרת זהה אחרי נרמול
 * (comparableSegment). הקורא מחליט: אחד = נמצא, יותר = עמום (ידני).
 */
export async function findByFileName(gitSource, { roots, name }, commitSha) {
  const key = comparableSegment(name);
  const exact = [];
  const loose = [];
  for (const root of roots) {
    const files = await gitSource.listTxtFilesUnder(root, commitSha);
    for (const rel of files || []) {
      const path = `${root}/${rel}`;
      if (!isAllowedRepoPath(path)) continue;
      const base = rel.slice(rel.lastIndexOf('/') + 1);
      if (base === name) exact.push(path);
      else if (comparableSegment(base) === key) loose.push(path);
    }
  }
  return exact.length ? exact : loose;
}

/**
 * שמות קובץ לחיפוש כשאין נתיב מהימן: שם הקובץ מהנתיב שנשלח (קובץ שהועבר), ושם הספר (נתיב חסר, או קובץ ששונה שמו).
 * null כשאין שורשי חיפוש תקינים לתיקיית המקור, או שגיט-המקור אינו תומך ברשימת קבצים.
 */
function nameFallback(report, hints, gitSource) {
  if (typeof gitSource.listTxtFilesUnder !== 'function') return null;
  const roots = rootsForFolder(hints.sourceFolder);
  if (!roots) return null;
  const names = [];
  const segs = safeSegments(hints.libraryRelativePath);
  if (segs && hints.libraryRelativePath.toLowerCase().endsWith('.txt')) names.push(segs[segs.length - 1]);
  const title = typeof report.bookTitle === 'string' ? report.bookTitle.trim() : '';
  if (title && title.length <= 200 && !/[\\/\u0000-\u001f]/.test(title)) names.push(`${title}.txt`);
  return names.length ? { roots, names: [...new Set(names)] } : null;
}

/**
 * הקובץ היחיד שנקרא בשם (לפי הסדר: שם הקובץ מהנתיב, ואז שם הספר). שם שנמצאו לו כמה קבצים (גם אחרי נרמול) —
 * עמום: null, והדיווח נשאר ידני כמו קודם. שם שלא נמצא — עוברים לשם הבא.
 */
async function findByBookName(gitSource, fb, commitSha) {
  if (!fb) return null;
  for (const name of fb.names) {
    const hits = await findByFileName(gitSource, { roots: fb.roots, name }, commitSha);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

const normalizeLoose =(s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

function findCandidates(lines, original, selection, limit = 5) {
  const out = [];
  const needleNorm = normalizeLoose(original);
  const sel = typeof selection === 'string' && selection.trim().length >= 2 ? selection : null;
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const t = lines[i].text;
    if (normalizeLoose(t) === needleNorm || (sel && t.includes(sel))) out.push({ lineIndex: i, line: t });
  }
  return out;
}

/**
 * התאמת שורת הדיווח בתוכן הקובץ.
 * @returns {{status:string, lineIndex:(number|null), currentLine:(string|null), match:string, candidates:Array}}
 */
export function matchLine(content, { originalLine, lineIndex, newLine, originalSelection }) {
  const { bom, lines } = splitSourceLines(content);
  const texts = lines.map((l) => l.text);
  // שורה 0 ב-DB עשויה לכלול את ה-BOM; ההשוואה נעשית בלעדיו.
  const orig = bom && originalLine.startsWith('\ufeff') ? originalLine.slice(1) : originalLine;
  const target = typeof newLine === 'string' && bom && newLine.startsWith('\ufeff') ? newLine.slice(1) : newLine;

  if (Number.isSafeInteger(lineIndex) && lineIndex >= 0 && lineIndex < texts.length) {
    const cur = texts[lineIndex];
    if (cur === orig) return { status: 'exact', lineIndex, currentLine: cur, match: 'exact', candidates: [], originalLine: orig, newLine: target };
    if (typeof target === 'string' && cur === target) {
      // כמה פעמים כל שורה מופיעה בקובץ: שגיאה שזזה (שורות נוספו לפניה) או שורה שחוזרת (כותרת סעיף)
      // נראות כאן בדיוק כמו תיקון שהוחל — הסגירה האוטומטית בודקת זאת (already-applied.js).
      const occurrences = { original: texts.filter((t) => t === orig).length, proposed: texts.filter((t) => t === target).length };
      // הפסקה המדווחת עצמה (locate-edit.js — הכלל של "נקלט"): זוהתה בקובץ, ובכל עותקיה במקום העריכה ההצעה ולא
      // המקור. נבדק כאן כי רק כאן יש את הקובץ כולו; already-applied.js דורש fixed באזור שכולל את המקום המדווח.
      const loc = locateEdit({ original: orig, proposed: target, current: indexLines(texts) });
      // האיתור מנורמל (בלי תגיות) ומזהה את הפסקה בלבד. rawHeld — יש בקובץ עותק שבו המילה תוקנה ושינוי התגיות שאושר
      // לא (absorption.js, אותו כלל כמו במפרסם וב"נקלט"): שורה זהה להצעה במקום המדווח אינה מכסה עליו.
      const located = { status: loc.status, reason: loc.reason, lines: loc.lines, rawHeld: rawPartHeld({ originalLine: orig, newLine: target }, texts) };
      return { status: 'already_applied', lineIndex, currentLine: cur, match: 'none', candidates: [], originalLine: orig, newLine: target, occurrences, located };
    }
  }

  const exactIdx = [];
  for (let i = 0; i < texts.length && exactIdx.length < 2; i++) if (texts[i] === orig) exactIdx.push(i);
  if (exactIdx.length === 1) {
    const i = exactIdx[0];
    return { status: Number.isSafeInteger(lineIndex) ? 'relocated' : 'exact', lineIndex: i, currentLine: texts[i], match: 'exact', candidates: [], originalLine: orig, newLine: target };
  }
  if (exactIdx.length > 1) {
    return { status: 'ambiguous', lineIndex: null, currentLine: null, match: 'ambiguous', candidates: findCandidates(lines, orig, originalSelection, 10).filter((c) => c.line === orig) };
  }
  const candidates = findCandidates(lines, orig, originalSelection);
  const lineExists = Number.isSafeInteger(lineIndex) && lineIndex < texts.length;
  return {
    status: lineExists ? 'source_changed' : 'selection_not_found',
    lineIndex: lineExists ? lineIndex : null,
    currentLine: lineExists ? texts[lineIndex] : null,
    match: candidates.length === 1 && normalizeLoose(candidates[0].line) === normalizeLoose(orig) ? 'unique_normalized' : 'none',
    candidates,
  };
}

const BOM_CHAR = '﻿';
const countLines = (texts, line) => texts.reduce((n, t) => (t === line ? n + 1 : n), 0);

/**
 * התאמה שמתעלמת מתגיות ומתכונות תגיות (class="footnote-marker" ועוד), כשההתאמה המדויקת נכשלה. ספק = null (ידני), וכל
 * תוצאה מותנית בייחוד: שורה אחת בלבד בקובץ שהמקור המנורמל שלה זהה, ושורת הדיווח ארוכה מספיק (לא כותרת).
 * - relocated: המקור לא תוקן, והשורה שאותרה נושאת תגיות אחרות. השינוי מוחל על השורה *הנוכחית* (rebaseLineChange, בלי
 *   התנגשויות) ולא על שורת המשתמש, כדי לא לדרוס את שינוי התגיות שנעשה בקובץ; rebasedNewLine היא השורה שתיכתב.
 * - already_applied: ההצעה כבר בקובץ, אך עם תגיות אחרות. נסגר רק לפי אותם כללים של already-applied.js: האיתור קובע
 *   fixed, העריכה (editState) מוחלת, ושינוי התגיות של ההצעה כולו במקומו (rawPartHeld). בלי editApplied — לא נסגר.
 * @returns {object|null} תוצאה בצורת matchLine, או null
 */
export function matchLineLoose(content, { originalLine, newLine }) {
  if (typeof originalLine !== 'string' || typeof newLine !== 'string') return null;
  const { bom, lines } = splitSourceLines(content);
  const texts = lines.map((l) => l.text);
  const orig = bom && originalLine.startsWith(BOM_CHAR) ? originalLine.slice(1) : originalLine;
  const target = bom && newLine.startsWith(BOM_CHAR) ? newLine.slice(1) : newLine;
  if (!isDistinctiveLine(orig) || target === orig || /[\r\n]/.test(target)) return null;
  const index = indexLines(texts);
  const loc = locateEdit({ original: orig, proposed: target, current: index });
  const base = { originalLine: orig, newLine: target, candidates: [], match: 'unique_normalized', matchBasis: 'tags' };

  if (loc.status === LOCATE.FIXED) {
    const [from, to] = loc.lines ?? [null, null];
    if (from === null || from !== to) return null;
    const cur = texts[from];
    // שורה זהה להצעה (גם אם זזה) היא עניינו של הכלל המדויק (matchLine/isExactlyApplied) — כאן רק שורה בתגיות אחרות.
    // העריכה נבדקת בנרמול בלי תגיות (כמו האיתור); שינוי התגיות של ההצעה עצמה נבדק בנפרד (rawPartHeld).
    if (cur === target || editState(canon(cur), lineEdit(canon(orig), canon(target))) !== 'applied' || rawPartHeld({ originalLine: orig, newLine: target }, texts)) return null;
    return {
      ...base, status: 'already_applied', lineIndex: from, currentLine: cur, match: 'none', editApplied: true,
      occurrences: { original: countLines(texts, orig), proposed: countLines(texts, target) },
      located: { status: loc.status, reason: loc.reason, lines: loc.lines, rawHeld: false },
    };
  }
  if (loc.status !== LOCATE.NOT_FIXED) return null;
  const hits = index.byCanon.get(canon(orig)) ?? [];
  if (hits.length !== 1) return null;
  const at = hits[0];
  const cur = texts[at];
  if (loc.lines?.[0] !== at || loc.lines?.[1] !== at || cur === orig || /[\r\n]/.test(cur)) return null;
  // הבדל ברווחים בלבד אינו שינוי תגיות — נשאר ידני כמו קודם (matchLine: unique_normalized)
  if (rawCanon(cur) === rawCanon(orig)) return null;
  const merged = rebaseLineChange(orig, target, cur);
  if (!merged.clean || merged.conflicts !== 0 || merged.applied < 1 || merged.line === cur || /[\r\n]/.test(merged.line)) return null;
  // הטקסט (בלי תגיות) של השורה אחרי השינוי חייב להיות בדיוק מה שהמשתמש הציע
  if (canon(merged.line) !== canon(target)) return null;
  return { ...base, status: 'relocated', lineIndex: at, currentLine: cur, rebasedNewLine: merged.line };
}

/** סטטוסים שמהם מותר לבנות חבילת שינוי. */
export const USABLE_STATUSES = new Set(['exact', 'relocated']);

/**
 * @param {object} args
 * @param {object} args.report      מסמך הדיווח (sourceFolder, sourceHint, filePath, location)
 * @param {object} args.revision    גרסת ההצעה (originalLine, originalSelection, ...)
 * @param {{getHead:()=>Promise<{commitSha:string}>, getFile:(path:string, commitSha:string)=>Promise<{blobSha:string, content:string}|null>}} args.gitSource
 * @param {{repo:string, ref:string}} args.source
 * @param {{path:string, lineIndex:number}} [args.override]  בחירה ידנית של מתנדב
 * @param {number} [args.contextLines]  שורות הקשר ל-diff (רק כשהשורה אותרה בוודאות)
 * @param {boolean} [args.nameFallback]  גיבוי לפי שם הקובץ/הספר כשאין נתיב או שהתיישן (ברירת מחדל: כן)
 */
export async function resolveSource({ report, revision, gitSource, source, override = null, contextLines = DEFAULT_DIFF_CONTEXT_LINES, nameFallback: useNameFallback = true }) {
  const base = { repo: source.repo, ref: source.ref, commitSha: null, path: null, blobSha: null, lineIndex: null, currentLine: null, match: 'none', candidates: [] };
  const folder = report.sourceHint?.sourceFolder || report.sourceFolder;
  if (!revision || typeof revision.originalLine !== 'string') return { ...base, status: 'no_proposal', reason: 'free_text' };

  let paths;
  let byName = null;
  const hints = { sourceFolder: folder, libraryRelativePath: report.sourceHint?.libraryRelativePath || report.filePath };
  if (override) {
    if (!isAllowedRepoPath(override.path)) return { ...base, status: 'invalid_path', reason: 'path_not_allowed' };
    paths = [override.path];
  } else {
    paths = candidatePaths(hints);
    if (!paths.length && typeof gitSource.listTxtFilesUnder === 'function') byName = bareFileHint(hints);
    if (!paths.length && !byName && !(useNameFallback && nameFallback(report, hints, gitSource))) return { ...base, status: 'not_found', reason: 'no_candidate_path' };
  }

  const head = await gitSource.getHead();
  const withHead = { ...base, commitSha: head.commitSha };
  const found = [];
  for (const p of paths) {
    const f = await gitSource.getFile(p, head.commitSha);
    if (f) found.push({ path: p, ...f });
  }
  let pathMatch = 'exact';
  // רק שם קובץ: מחפשים אותו בכל עומק תחת תיקיית המקור. כמה התאמות = עמום, לבחירה ידנית.
  if (byName) {
    const hits = await findByFileName(gitSource, byName, head.commitSha);
    if (hits.length > 1) return { ...withHead, status: 'ambiguous', reason: 'source_ambiguous', match: 'ambiguous', candidates: hits.map((path) => ({ path })) };
    const f = hits.length === 1 && (await gitSource.getFile(hits[0], head.commitSha));
    if (f) found.push({ path: hits[0], ...f });
    pathMatch = 'filename';
  }
  // הנתיב כלשונו לא קיים: מחפשים אותו לפי שמות התיקיות בפועל (האיות של ה-DB שונה מזה של הריפו)
  if (!found.length && paths.length && !override && typeof gitSource.listDir === 'function') {
    const loc = hintedLocation(hints);
    for (const root of loc.roots) {
      const p = await findNormalizedPath(gitSource, root, loc.segs, head.commitSha);
      const f = p && (await gitSource.getFile(p, head.commitSha));
      if (f) found.push({ path: p, ...f });
    }
    if (found.length) pathMatch = 'normalized';
  }
  // אין נתיב, או שהנתיב התיישן (הקובץ הועבר קטגוריה / שונה שמו): לפי שם הקובץ מהנתיב ולפי שם הספר, רק כשהתוצאה יחידה
  const fb = !found.length && !override && useNameFallback ? await findByBookName(gitSource, nameFallback(report, hints, gitSource), head.commitSha) : null;
  if (fb) {
    const f = await gitSource.getFile(fb, head.commitSha);
    if (f) {
      found.push({ path: fb, ...f });
      pathMatch = 'name_fallback';
    }
  }
  if (!found.length) {
    return paths.length || byName
      ? { ...withHead, status: 'not_found', reason: 'file_missing_in_repo', candidates: paths.map((p) => ({ path: p })) }
      : { ...withHead, status: 'not_found', reason: 'no_candidate_path' };
  }
  if (found.length > 1) return { ...withHead, status: 'ambiguous', reason: 'source_ambiguous', match: 'ambiguous', candidates: found.map((f) => ({ path: f.path })) };

  const file = found[0];
  if (file.lossy) return { ...withHead, path: file.path, blobSha: file.blobSha, status: 'manual_only', reason: 'non_utf8_source' };
  const lineIndex = override ? override.lineIndex : report.location?.lineIndex ?? null;
  const newLine = computeNewLine(revision) ?? revision.newLine ?? null;
  let m = matchLine(file.content, {
    originalLine: override?.expectedLine ?? revision.originalLine,
    lineIndex,
    newLine,
    originalSelection: revision.originalSelection,
  });
  // קובץ שאותר לפי שם (לא לפי נתיב שנשלח): גם התאמה מדויקת חייבת להיות המופע היחיד של השורה בקובץ
  if (pathMatch === 'name_fallback' && USABLE_STATUSES.has(m.status) && countLines(splitSourceLines(file.content).lines.map((l) => l.text), m.originalLine ?? revision.originalLine) > 1) {
    m = { ...m, status: 'ambiguous', lineIndex: null, currentLine: null, match: 'ambiguous', candidates: [] };
  }
  // התאמה מדויקת נכשלה: התאמה שמתעלמת מתגיות (רק בייחוד מלא; ללא override — מתנדב שבחר שורה אחראי עליה)
  let loose = null;
  if (!override && (m.status === 'source_changed' || m.status === 'selection_not_found')) {
    loose = matchLineLoose(file.content, { originalLine: revision.originalLine, newLine });
    if (loose) m = loose;
  }
  return {
    ...withHead,
    path: file.path,
    blobSha: file.blobSha,
    status: m.status,
    reason: m.status,
    lineIndex: m.lineIndex,
    currentLine: m.currentLine,
    match: m.match,
    candidates: (m.candidates || []).map((c) => ({ path: file.path, ...c })),
    bomAdjusted: m.originalLine !== undefined && m.originalLine !== revision.originalLine,
    occurrences: m.occurrences ?? null,
    located: m.located ?? null,
    pathMatch,
    matchBasis: m.matchBasis ?? null,
    rebasedNewLine: m.rebasedNewLine ?? null,
    editApplied: m.editApplied ?? false,
    resolvedBy: override ? 'volunteer' : 'auto',
    context: USABLE_STATUSES.has(m.status) ? extractLineContext(splitSourceLines(file.content), m.lineIndex, contextLines) : null,
  };
}
