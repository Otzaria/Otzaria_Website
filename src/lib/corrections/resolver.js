/**
 * איתור מקור הדיווח במאגר otzaria-library (CONTRACT §1.1). כל רמז מהלקוח הוא לא
 * מהימן: הנתיב מחושב מחדש, נבדק מול הריפו, והשורה מותאמת בדיוק. ספק = ידני.
 */
import { splitSourceLines } from './source-text.js';
import { computeNewLine } from './payload.js';
import { extractLineContext, DEFAULT_DIFF_CONTEXT_LINES } from './unified-diff.js';
import { reachesOtzariaInbox } from './report-email.js';

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
      return { status: 'already_applied', lineIndex, currentLine: cur, match: 'none', candidates: [], originalLine: orig, newLine: target };
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
 */
export async function resolveSource({ report, revision, gitSource, source, override = null, contextLines = DEFAULT_DIFF_CONTEXT_LINES }) {
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
    if (!paths.length && !byName) return { ...base, status: 'not_found', reason: 'no_candidate_path' };
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
  if (!found.length) return { ...withHead, status: 'not_found', reason: 'file_missing_in_repo', candidates: paths.map((p) => ({ path: p })) };
  if (found.length > 1) return { ...withHead, status: 'ambiguous', reason: 'source_ambiguous', match: 'ambiguous', candidates: found.map((f) => ({ path: f.path })) };

  const file = found[0];
  if (file.lossy) return { ...withHead, path: file.path, blobSha: file.blobSha, status: 'manual_only', reason: 'non_utf8_source' };
  const lineIndex = override ? override.lineIndex : report.location?.lineIndex ?? null;
  const m = matchLine(file.content, {
    originalLine: override?.expectedLine ?? revision.originalLine,
    lineIndex,
    newLine: computeNewLine(revision) ?? revision.newLine ?? null,
    originalSelection: revision.originalSelection,
  });
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
    pathMatch,
    resolvedBy: override ? 'volunteer' : 'auto',
    context: USABLE_STATUSES.has(m.status) ? extractLineContext(splitSourceLines(file.content), m.lineIndex, contextLines) : null,
  };
}
