/**
 * איתור מקור הדיווח במאגר otzaria-library (CONTRACT §1.1). כל רמז מהלקוח הוא לא
 * מהימן: הנתיב מחושב מחדש, נבדק מול הריפו, והשורה מותאמת בדיוק. ספק = ידני.
 */
import { splitSourceLines } from './source-text.js';
import { computeNewLine } from './payload.js';

const LIB_PREFIX = 'אוצריא/';
const BOOKS_SEGMENT = 'ספרים/אוצריא';
const FOLDER_RE = /^[A-Za-z0-9_-]{1,100}$/;
const SPECIAL_ROOTS = {
  DictaToOtzaria: ['DictaToOtzaria/ערוך/ספרים/אוצריא'],
};
// ספרי ספריא נבנים מארכיון SefariaExport ולא מקבצי המאגר → טיפול חיצוני, אין נתיב Git.
const EXTERNAL_SEFARIA_FOLDERS = new Set(['sefaria', 'sefariatootzaria']);

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
  if (EXTERNAL_SEFARIA_FOLDERS.has(folder.toLowerCase())) return null;
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

/** האם הדיווח על ספר שמקורו ספריא (לפי תיקיית המקור או שם המקור ברמז). */
export function isExternalSefariaSource({ sourceFolder, sourceName } = {}) {
  const f = typeof sourceFolder === 'string' ? sourceFolder.trim().toLowerCase() : '';
  const n = typeof sourceName === 'string' ? sourceName.trim().toLowerCase() : '';
  return EXTERNAL_SEFARIA_FOLDERS.has(f) || n === 'sefaria';
}

/** ניתוב מקור ברמת הדיווח: 'external_handling' לספרי ספריא, אחרת 'repo'. */
export function routeSourceKind(report) {
  const hint = report.sourceHint || {};
  const external = isExternalSefariaSource({ sourceFolder: report.sourceFolder, sourceName: hint.sourceName })
    || isExternalSefariaSource({ sourceFolder: hint.sourceFolder });
  return external ? 'external_handling' : 'repo';
}

/** מועמדי נתיב Git מהרמזים. לעולם אינו מאמת קיום — רק מחשב. */
export function candidatePaths({ sourceFolder, libraryRelativePath }) {
  if (typeof libraryRelativePath !== 'string' || !libraryRelativePath.startsWith(LIB_PREFIX)) return [];
  const rest = libraryRelativePath.slice(LIB_PREFIX.length);
  const segs = safeSegments(rest);
  if (!segs || !rest.toLowerCase().endsWith('.txt')) return [];
  const roots = rootsForFolder(sourceFolder);
  if (!roots) return [];
  return roots.map((r) => `${r}/${rest}`).filter(isAllowedRepoPath);
}

const normalizeLoose = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

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
 */
export async function resolveSource({ report, revision, gitSource, source, override = null }) {
  const base = { repo: source.repo, ref: source.ref, commitSha: null, path: null, blobSha: null, lineIndex: null, currentLine: null, match: 'none', candidates: [] };
  const folder = report.sourceHint?.sourceFolder || report.sourceFolder;
  if (routeSourceKind(report) === 'external_handling') return { ...base, status: 'external_handling', reason: 'sefaria_generator' };
  if (!revision || typeof revision.originalLine !== 'string') return { ...base, status: 'no_proposal', reason: 'free_text' };

  let paths;
  if (override) {
    if (!isAllowedRepoPath(override.path)) return { ...base, status: 'invalid_path', reason: 'path_not_allowed' };
    paths = [override.path];
  } else {
    paths = candidatePaths({ sourceFolder: folder, libraryRelativePath: report.sourceHint?.libraryRelativePath || report.filePath });
    if (!paths.length) return { ...base, status: 'not_found', reason: 'no_candidate_path' };
  }

  const head = await gitSource.getHead();
  const found = [];
  for (const p of paths) {
    const f = await gitSource.getFile(p, head.commitSha);
    if (f) found.push({ path: p, ...f });
  }
  const withHead = { ...base, commitSha: head.commitSha };
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
    resolvedBy: override ? 'volunteer' : 'auto',
  };
}
