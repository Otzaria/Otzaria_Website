/**
 * לוגיקה משותפת לעמוד "מקורות ספרים פרטיים".
 *
 * הספרים הפרטיים יושבים בתיקיית MoreBooks בריפו Otzaria/otzaria-library.
 * ספר = קובץ בודד (txt/pdf/docx) תחת "ספרים/". הרשימה נמשכת מגיטהאב ונשמרת
 * במטמון בזיכרון התהליך, כי היא זהה לכל המנהלים ואינה משתנה תדיר.
 */

import { listRepoFiles } from '@/lib/dicta/github-api';
import { cached, invalidate } from '@/lib/api-cache';
import SystemConfig from '@/models/SystemConfig';

export const MORE_BOOKS_BASE_PATH = 'MoreBooks';
export const BOOK_EXTENSIONS = ['.txt', '.pdf', '.docx'];

/** תיקייה שאינה ספרים (תיעוד התוכנה) */
const EXCLUDED_PREFIXES = ['ספרים/אוצריא/אודות התוכנה/'];

const CACHE_KEY = 'private-sources:more-books';
const CACHE_TTL_MS = 10 * 60 * 1000;

// ===== רשימות אופציות דינמיות (SystemConfig) =====

export const CONFIG_KEYS = {
  statuses: 'private_source_statuses',
  methods: 'private_source_permission_methods',
  platforms: 'private_source_platforms',
};

export const DEFAULT_STATUSES = {
  missing_info: { label: 'חסר מידע', color: '#ef4444' },
  partial: { label: 'חלקי', color: '#f59e0b' },
  complete: { label: 'מלא', color: '#10b981' },
  needs_check: { label: 'דורש בירור', color: '#3b82f6' },
};

export const DEFAULT_METHODS = {
  email: { label: 'מייל', color: '#3b82f6' },
  chat: { label: "צ'אט", color: '#10b981' },
  phone: { label: 'טלפון', color: '#f59e0b' },
  written: { label: 'מכתב/מסמך', color: '#8b5cf6' },
  in_person: { label: 'בעל פה', color: '#94a3b8' },
};

export const DEFAULT_PLATFORMS = {
  otzaria: { label: 'אוצריא', color: '#3b82f6' },
  zayit: { label: 'זית', color: '#10b981' },
  sefaria: { label: 'ספריא', color: '#f59e0b' },
  all: { label: 'לכולם', color: '#8b5cf6' },
};

export const DEFAULT_CONFIGS = {
  [CONFIG_KEYS.statuses]: DEFAULT_STATUSES,
  [CONFIG_KEYS.methods]: DEFAULT_METHODS,
  [CONFIG_KEYS.platforms]: DEFAULT_PLATFORMS,
};

export const DEFAULT_STATUS_KEY = 'missing_info';

/** שולף את שלוש רשימות האופציות, עם נפילה לברירות המחדל. דורש connectDB לפני. */
export async function loadOptionConfigs() {
  const keys = Object.values(CONFIG_KEYS);
  const docs = await SystemConfig.find({ key: { $in: keys } }).lean();
  const byKey = new Map(docs.map((d) => [d.key, d.value]));

  const pick = (key) => {
    const value = byKey.get(key);
    return value && typeof value === 'object' && Object.keys(value).length > 0
      ? value
      : DEFAULT_CONFIGS[key];
  };

  return {
    statuses: pick(CONFIG_KEYS.statuses),
    methods: pick(CONFIG_KEYS.methods),
    platforms: pick(CONFIG_KEYS.platforms),
  };
}

// ===== רשימת הספרים מגיטהאב =====

function fileTypeOf(path) {
  const match = path.match(/\.([^./]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/** שם לתצוגה: שם הקובץ ללא סיומת */
export function pathToBookTitle(path) {
  const fileName = path.split('/').pop() || path;
  return fileName.replace(/\.[^./]+$/, '');
}

/**
 * קטגוריה עליונה: הסגמנט שאחרי "ספרים/אוצריא/", או "לא מותאם עדיין לאוצריא"
 * (וכל תיקייה אחרת ישירות תחת "ספרים/").
 */
export function pathToCategory(path) {
  const parts = path.split('/');
  if (parts[0] !== 'ספרים') return parts[0] || 'אחר';
  // הסגמנט נחשב קטגוריה רק כשהוא תיקייה (כלומר אינו האיבר האחרון בנתיב)
  if (parts[1] === 'אוצריא') return parts.length > 3 ? parts[2] : 'אוצריא';
  return parts.length > 2 ? parts[1] : 'אחר';
}

const NOTES_PREFIX = 'הערות על ';

/** האם הקובץ הוא קובץ הערות נלווה ("הערות על X.txt") */
function isNotesFile(path) {
  return (path.split('/').pop() || '').startsWith(NOTES_PREFIX);
}

/** מוצא את נתיב הספר שקובץ ההערות שייך לו (באותה תיקייה), או null */
function findParentPath(notesPath, allPaths) {
  const dir = notesPath.split('/').slice(0, -1).join('/');
  const baseName = (notesPath.split('/').pop() || '')
    .replace(/\.[^./]+$/, '')
    .slice(NOTES_PREFIX.length);
  if (!baseName) return null;
  for (const ext of BOOK_EXTENSIONS) {
    const candidate = `${dir}/${baseName}${ext}`;
    if (allPaths.has(candidate)) return candidate;
  }
  return null;
}

/** מושך מגיטהאב את רשימת הספרים הפרטיים (ללא מטמון). */
async function fetchMoreBooks() {
  const files = await listRepoFiles({
    basePath: MORE_BOOKS_BASE_PATH,
    extensions: BOOK_EXTENSIONS,
  });

  const books = files.filter(
    (f) => f.path.startsWith('ספרים/') && !EXCLUDED_PREFIXES.some((p) => f.path.startsWith(p))
  );

  const allPaths = new Set(books.map((b) => b.path));

  return books
    .map((b) => {
      const notes = isNotesFile(b.path);
      return {
        bookPath: b.path,
        bookTitle: pathToBookTitle(b.path),
        category: pathToCategory(b.path),
        fileType: fileTypeOf(b.path),
        size: b.size || 0,
        isNotesCompanion: notes,
        parentPath: notes ? findParentPath(b.path, allPaths) : null,
      };
    })
    .sort((a, b) => a.bookPath.localeCompare(b.bookPath, 'he'));
}

/** רשימת הספרים עם מטמון של 10 דקות. forceRefresh מנקה את המטמון קודם. */
export async function getMoreBooksList({ forceRefresh = false } = {}) {
  // הערה: invalidate() אינו מבטל משיכה שכבר רצה ברקע, ולכן משיכה מקבילה
  // שהתחילה לפני הרענון עלולה לאכלס מחדש את המטמון בנתונים ישנים.
  // מקובל כאן, כי ה-TTL הוא 10 דקות והנתונים אינם קריטיים לזמן אמת.
  if (forceRefresh) invalidate(CACHE_KEY);
  return cached(CACHE_KEY, CACHE_TTL_MS, fetchMoreBooks);
}
