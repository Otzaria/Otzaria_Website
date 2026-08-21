/**
 * לוגיקת "סטים" לספרים פרטיים — קובץ טהור (ללא mongoose), כדי שיהיה ניתן
 * לבדיקה ולשימוש הן בשרת והן בלוגיקה המשותפת.
 *
 * סט = כמה ספרים שהם חלקים של אותו חיבור, ולכן חולקים רשומת מקור אחת.
 * שתי דרכים לקבוצה:
 *   1. אוטומטי — לפי תבנית השם "<שם> על <נושא>" (למשל "עולת שלמה על זבחים").
 *      נוצר סט רק כשיש שני ספרים או יותר עם אותו שם לפני " על ".
 *   2. ידני — המנהל מגדיר סט בשם כלשהו ומשייך אליו ספרים לפי בחירתו.
 *      שיוך ידני גובר על הקיבוץ האוטומטי.
 *
 * הרשומה של סט נשמרת ב-PrivateBookSource עם מזהה סינתטי:
 * bookPath = 'set:m:' + מפתח הסט (ידני) או 'set:a:' + שם הסט (אוטומטי).
 * המרחבים מופרדים כדי שסט ידני וסט אוטומטי בעלי אותו שם לא יחלקו רשומה.
 */

/** תחילית המזהה הסינתטי של רשומת סט (משותפת לשני הסוגים) */
export const SET_PATH_PREFIX = 'set:';

/** תחילית רשומת סט ידני */
export const MANUAL_SET_PATH_PREFIX = `${SET_PATH_PREFIX}m:`;

/** תחילית רשומת סט אוטומטי */
export const AUTO_SET_PATH_PREFIX = `${SET_PATH_PREFIX}a:`;

/** מפתח ה-SystemConfig שבו נשמרים הסטים הידניים */
export const MANUAL_SETS_CONFIG_KEY = 'private_source_manual_sets';

/** המפריד שממנו נגזר שם סט אוטומטי */
const AUTO_SET_SEPARATOR = ' על ';

/** מספר החברים המינימלי ליצירת סט אוטומטי */
const MIN_AUTO_SET_MEMBERS = 2;

export const MANUAL_SET_LIMITS = {
  labelMax: 200,
  pathMax: 500,
  pathsMax: 1000,
  setsMax: 500,
  // תקרה מצטברת לכל הסטים יחד, כדי שהערך ב-SystemConfig לא יתפח ללא גבול
  totalPathsMax: 20000,
};

/** קטגוריה לסט ידני שאין לו חברים קיימים */
const FALLBACK_CATEGORY = 'אחר';

/** האם המזהה הוא של רשומת סט (ולא של ספר בגיטהאב) */
export function isSetPath(path) {
  return typeof path === 'string' && path.startsWith(SET_PATH_PREFIX);
}

/** מזהה סינתטי לרשומת סט ידני */
export function toManualSetPath(setKey) {
  return `${MANUAL_SET_PATH_PREFIX}${setKey}`;
}

/** מזהה סינתטי לרשומת סט אוטומטי */
export function toAutoSetPath(setName) {
  return `${AUTO_SET_PATH_PREFIX}${setName}`;
}

/** מזהה סינתטי לרשומת סט לפי סוגו */
export function toSetPath(setKey, { isManual = false } = {}) {
  return isManual ? toManualSetPath(setKey) : toAutoSetPath(setKey);
}

/**
 * שם הסט האוטומטי הנגזר משם הספר: החלק שלפני " על " הראשון.
 * מחזיר '' כשאין תבנית כזו (ואז הספר נשאר עומד בפני עצמו).
 */
export function deriveAutoSetName(bookTitle) {
  if (typeof bookTitle !== 'string') return '';
  const index = bookTitle.indexOf(AUTO_SET_SEPARATOR);
  if (index <= 0) return '';
  return bookTitle.slice(0, index).trim();
}

/** מפתח סט ידני מתוך שם התצוגה (רווחים → קווים תחתונים, כמו ברשימות האופציות) */
export function manualSetKeyFromLabel(label) {
  return String(label || '')
    .trim()
    .replace(/\s+/g, '_');
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * נרמול סובלני של אובייקט הסטים הידניים (למשל בקריאה מה-DB):
 * מדלג על ערכים לא תקינים, מסיר כפילויות נתיב בתוך סט ובין סטים (הראשון גובר).
 */
export function normalizeManualSets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  // Object.create(null) — כדי ש-"__proto__" ייכתב כמאפיין רגיל ולא ידרוס פרוטוטיפ
  const bySetKey = Object.create(null);
  const seenPaths = new Set();

  for (const [rawKey, entry] of Object.entries(value)) {
    const setKey = cleanText(rawKey, MANUAL_SET_LIMITS.labelMax);
    if (!setKey) continue;
    const label = cleanText(entry?.label, MANUAL_SET_LIMITS.labelMax) || setKey;

    const bookPaths = [];
    const source = Array.isArray(entry?.bookPaths) ? entry.bookPaths : [];
    for (const rawPath of source) {
      const bookPath = cleanText(rawPath, MANUAL_SET_LIMITS.pathMax);
      if (!bookPath || seenPaths.has(bookPath)) continue;
      seenPaths.add(bookPath);
      bookPaths.push(bookPath);
      if (bookPaths.length >= MANUAL_SET_LIMITS.pathsMax) break;
    }

    bySetKey[setKey] = { label, bookPaths };
    if (Object.keys(bySetKey).length >= MANUAL_SET_LIMITS.setsMax) break;
  }

  return { ...bySetKey };
}

/**
 * ולידציה קפדנית לשמירה מהממשק: מחזיר { value } או { error } (טקסט לתצוגה).
 * בשונה מ-normalizeManualSets — כאן ספר שמופיע בשני סטים הוא שגיאה.
 */
export function validateManualSets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'ערך הגדרות לא תקין' };
  }

  const entries = Object.entries(value);
  if (entries.length > MANUAL_SET_LIMITS.setsMax) {
    return { error: `אפשר להגדיר עד ${MANUAL_SET_LIMITS.setsMax} סטים` };
  }

  const bySetKey = Object.create(null);
  const pathToSet = new Map();
  let totalPaths = 0;

  for (const [rawKey, entry] of entries) {
    const setKey = cleanText(rawKey, MANUAL_SET_LIMITS.labelMax);
    if (!setKey) return { error: 'מפתח סט לא תקין' };

    const label = cleanText(entry?.label, MANUAL_SET_LIMITS.labelMax);
    if (!label) return { error: `חסר שם לסט "${setKey}"` };

    if (entry?.bookPaths !== undefined && !Array.isArray(entry?.bookPaths)) {
      return { error: `רשימת הספרים של הסט "${label}" אינה תקינה` };
    }

    const source = Array.isArray(entry?.bookPaths) ? entry.bookPaths : [];
    if (source.length > MANUAL_SET_LIMITS.pathsMax) {
      return { error: `אפשר לשייך עד ${MANUAL_SET_LIMITS.pathsMax} ספרים לסט` };
    }

    const bookPaths = [];
    for (const rawPath of source) {
      const bookPath = cleanText(rawPath, MANUAL_SET_LIMITS.pathMax);
      if (!bookPath) continue;
      const owner = pathToSet.get(bookPath);
      if (owner && owner.setKey !== setKey) {
        return { error: `הספר "${bookPath}" משויך לשני סטים (${owner.label} ו-${label})` };
      }
      if (bookPaths.includes(bookPath)) continue;
      pathToSet.set(bookPath, { setKey, label });
      bookPaths.push(bookPath);
      totalPaths += 1;
      if (totalPaths > MANUAL_SET_LIMITS.totalPathsMax) {
        return {
          error: `אפשר לשייך עד ${MANUAL_SET_LIMITS.totalPathsMax} ספרים בכל הסטים יחד`,
        };
      }
    }

    bySetKey[setKey] = { label, bookPaths };
  }

  return { value: { ...bySetKey } };
}

/** הקטגוריה הנפוצה בין חברי הסט; בשוויון — הראשונה לפי סדר אלפביתי */
function dominantCategory(members) {
  const counts = new Map();
  for (const member of members) {
    counts.set(member.category, (counts.get(member.category) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && category.localeCompare(best, 'he') < 0)
    ) {
      best = category;
      bestCount = count;
    }
  }
  return best || FALLBACK_CATEGORY;
}

function toMember(book) {
  return { bookPath: book.bookPath, bookTitle: book.bookTitle, fileType: book.fileType };
}

function buildSetEntry({ setKey, setName, isManual, members }) {
  const sorted = [...members].sort((a, b) => a.bookPath.localeCompare(b.bookPath, 'he'));
  return {
    kind: 'set',
    setKey,
    setName,
    isManual,
    bookPath: toSetPath(setKey, { isManual }),
    bookTitle: setName,
    category: sorted.length > 0 ? dominantCategory(sorted) : FALLBACK_CATEGORY,
    books: sorted.map(toMember),
    // מיון: הסט מופיע במקום שבו היה מופיע הספר הראשון שלו; סט ריק בסוף הרשימה
    sortPath: sorted.length > 0 ? sorted[0].bookPath : `￿${setName}`,
  };
}

/**
 * בונה את רשימת הפריטים לתצוגה: ספרים עומדים בפני עצמם + סטים (ידניים ואוטומטיים).
 *
 * @param {object} params
 * @param {Array}  params.books       רשימת הספרים מגיטהאב
 * @param {object} params.manualSets  { [setKey]: { label, bookPaths } }
 * @returns {{ entries: Array, setPaths: string[] }}
 */
export function buildSourceEntries({ books = [], manualSets = {} } = {}) {
  const byPath = new Map(books.map((book) => [book.bookPath, book]));
  const claimed = new Set();

  // 1. סטים ידניים — גוברים על הקיבוץ האוטומטי
  const manualEntries = [];
  for (const [setKey, entry] of Object.entries(normalizeManualSets(manualSets))) {
    const members = [];
    for (const bookPath of entry.bookPaths) {
      const book = byPath.get(bookPath);
      // נתיב שאינו קיים עוד בגיטהאב פשוט אינו נספר כחבר
      if (!book || claimed.has(bookPath)) continue;
      claimed.add(bookPath);
      members.push(book);
    }
    manualEntries.push(
      buildSetEntry({ setKey, setName: entry.label, isManual: true, members })
    );
  }

  // 2. קיבוץ אוטומטי לפי "<שם> על <נושא>" מבין הספרים שלא שויכו ידנית
  const autoGroups = new Map();
  const standalone = [];
  for (const book of books) {
    if (claimed.has(book.bookPath)) continue;
    const setName = deriveAutoSetName(book.bookTitle);
    if (!setName) {
      standalone.push(book);
      continue;
    }
    const group = autoGroups.get(setName) || [];
    group.push(book);
    autoGroups.set(setName, group);
  }

  const autoEntries = [];
  for (const [setName, members] of autoGroups) {
    if (members.length < MIN_AUTO_SET_MEMBERS) {
      // שם ייחודי — הספר נשאר עומד בפני עצמו
      standalone.push(...members);
      continue;
    }
    autoEntries.push(buildSetEntry({ setName, setKey: setName, isManual: false, members }));
  }

  const bookEntries = standalone.map((book) => ({
    ...book,
    kind: 'book',
    sortPath: book.bookPath,
  }));

  const entries = [...bookEntries, ...manualEntries, ...autoEntries].sort((a, b) =>
    a.sortPath.localeCompare(b.sortPath, 'he')
  );

  return {
    entries,
    setPaths: [...manualEntries, ...autoEntries].map((entry) => entry.bookPath),
  };
}
