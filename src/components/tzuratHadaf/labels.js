// צורת הדף — הנוסחים והקבועים של ממשק המתנדב (טהור: בלי React ובלי DOM).
// החוזה: docs/tzurat-hadaf/CONTRACT.md ("צורות התגובה"), הפורמט: PACKAGE.md.

export const BASE_PATH = '/library/tzurat-hadaf'
export const FAST_PATH = `${BASE_PATH}/fast`
export const PRACTICE_PATH = `${BASE_PATH}/practice`
export const MINE_PATH = `${BASE_PATH}/mine`
export const ADMIN_PATH = '/library/admin/tzurat-hadaf'
export const GUIDE_PATH = '/docs/tzurat-hadaf'
export const API = '/api/tzurat-hadaf'

export const pagesPath = (slug) => (slug ? `${BASE_PATH}/pages?m=${encodeURIComponent(slug)}` : `${BASE_PATH}/pages`)
export const reviewPath = (id) => `${BASE_PATH}/review?page=${encodeURIComponent(id)}`

// פרקי דף ההנחיות (מזהי ה-section בנוסח ההנחיות — DEFAULT_GUIDE_HTML ב-src/lib/tzuratHadaf/guideContent.js)
export const GUIDE_SECTIONS = Object.freeze({
  fast: 'fast',
  replace: 'print-decides',
  words: 'fast',
  abbreviations: 'abbreviations',
  rashi: 'rashi-script',
  overview: 'page-parts',
  lines: 'lines',
  reports: 'reports',
})
export const guideHref = (section) => (section ? `${GUIDE_PATH}#${section}` : GUIDE_PATH)

// מסנן סוג הטקסט במסלול המהיר
export const KIND_FILTERS = [
  { id: 'any', label: 'הכל' },
  { id: 'g', label: 'גמרא' },
  { id: 'r', label: 'רש"י' },
  { id: 't', label: 'תוספות' },
]

// הסבר קצר לכל סוג שאלה (על הכרטיס)
export const QUESTION_HINT = {
  replace: 'השוו לסריקה ובחרו את מה שכתוב בדפוס, אות באות. גם קיצור או כתיב שונה הם הבדל.',
  print_only: 'האם המילים המודגשות כתובות בסריקה במקום המסומן?',
  otz_only: 'האם המילים המודגשות כתובות בסריקה במקום המסומן? אם הן בשורה או בעמוד סמוכים, בחרו "לא כאן, אבל סמוך".',
  paren: 'מראה מקום בסוגריים: האם הוא נדפס כאן?',
}
export const QUESTION_GUIDE = { replace: GUIDE_SECTIONS.replace, print_only: GUIDE_SECTIONS.words, otz_only: GUIDE_SECTIONS.words, paren: GUIDE_SECTIONS.words }

// מצבי עמוד ברשת (CONTRACT: books/[slug]/pages → state)
export const PAGE_STATE_UI = {
  open: { label: 'פנוי', tone: 'neutral', icon: 'lock_open', cls: 'border-outline-variant bg-surface' },
  mine: { label: 'בטיפולך', tone: 'info', icon: 'edit', cls: 'border-info-400 bg-info-50' },
  taken: { label: 'תפוס', tone: 'warning', icon: 'lock', cls: 'border-warning-300 bg-warning-50/60' },
  submitted: { label: 'הוגש — ממתין לבדיקה', tone: 'primary', icon: 'pending_actions', cls: 'border-primary/40 bg-primary-container/40' },
  approved: { label: 'אושר', tone: 'success', icon: 'verified', cls: 'border-success-400 bg-success-50' },
  done: { label: 'הושלם', tone: 'success', icon: 'task_alt', cls: 'border-success-300 bg-success-50/60' },
  closed: { label: 'סגור', tone: 'neutral', icon: 'block', cls: 'border-outline-variant bg-surface-variant/40 opacity-70' },
}
export const pageStateUi = (state) => PAGE_STATE_UI[state] || PAGE_STATE_UI.closed

// שלבי בדיקת העמוד (stage של הטיוטה)
export const STAGES = [
  { key: 'overview', label: 'מבט כללי', icon: 'visibility', text: 'השוו את העמוד כולו לסריקה: גושים, כותרות, תחילת העמוד וסופו, גודל האותיות.' },
  { key: 'lines', label: 'שורות', icon: 'view_agenda', text: 'בדקו שכל שורה מתחילה ונגמרת באותן מילים כמו בדפוס, והזיזו מילים בין שורות כשצריך.' },
  { key: 'text', label: 'נוסח', icon: 'text_fields', text: 'הכריעו בשאלות הנוסח של העמוד, וסמנו מילים שבדפוס כתובות אחרת.' },
  { key: 'submit', label: 'דיווח והגשה', icon: 'send', text: 'דווחו על מה שלא תוקן בשלבים הקודמים, ובדקו את הסיכום לפני ההגשה.' },
]
export const STAGE_KEYS = STAGES.map((s) => s.key)

// הבדיקות של "מבט כללי" (checks בהגשה) — וקטגוריית הדיווח שנפתחת ב"יש בעיה"
export const CHECKS = [
  { key: 'blocks', label: 'הגושים (גמרא, רש"י, תוספות) במקומם ובצורתם כמו בדפוס', category: 'block' },
  { key: 'headers', label: 'הכותרות (שם המסכת, הפרק, מספר הדף) כמו בדפוס', category: 'header' },
  { key: 'edges', label: 'העמוד מתחיל ונגמר באותן מילים כמו בדפוס', category: 'overflow' },
  { key: 'size', label: 'גודל האותיות ומרווח השורות דומים לדפוס', category: 'size' },
]

// קטגוריות הדיווח (PACKAGE.md §3)
export const REPORT_CATEGORIES = [
  { id: 'missing', label: 'חסר טקסט' },
  { id: 'extra', label: 'טקסט עודף' },
  { id: 'linebreak', label: 'שבירת שורות' },
  { id: 'block', label: 'גוש במקום או בצורה שגויים' },
  { id: 'size', label: 'גודל אות' },
  { id: 'header', label: 'כותרת' },
  { id: 'ein_mishpat', label: 'עין משפט' },
  { id: 'gilyon', label: 'גיליון ומפרשים בשוליים' },
  { id: 'overflow', label: 'טקסט שגלש לעמוד אחר' },
  { id: 'other', label: 'אחר' },
]
export const categoryLabel = (id) => REPORT_CATEGORIES.find((c) => c.id === id)?.label || id || ''

// סיבות לדחיית פעולת שורה (lineOps.applyLineOps → rejected[].reason)
export const REJECT_REASON = {
  unknown_line: 'השורה לא נמצאה בעמוד',
  first_line: 'אי אפשר להזיז את תחילת השורה הראשונה בגוש',
  no_word: 'המילה לא נמצאה בגוש',
  out_of_range: 'ההזזה הייתה משאירה שורה בלי מילים',
  locked: 'בגוש הזה אין בדיקת שורות',
  fake_line: 'שורה שהבנייה הוסיפה (הדרן/כותרת) — אין בה פעולות',
}

// "התרומות שלי"
export const SUBMISSION_STATUS = {
  processing: { label: 'השמירה לא הושלמה — לחצו להמשך', tone: 'warning' },
  submitted: { label: 'ממתין לבדיקה', tone: 'info' },
  approved: { label: 'אושר', tone: 'success' },
  rejected: { label: 'לא אושר', tone: 'error' },
}
export const REPORT_STATUS = {
  new: { label: 'חדש', tone: 'info' },
  in_progress: { label: 'בטיפול', tone: 'warning' },
  fixed: { label: 'תוקן', tone: 'success' },
  wontfix: { label: 'לא יתוקן', tone: 'neutral' },
  duplicate: { label: 'כפול', tone: 'neutral' },
}

export const BUILD_NOTE = 'השינויים ייראו בעמוד אחרי הבנייה הבאה של צורת הדף.'
export const SAVED_NOTE = 'נשמר — תודה'

/** מספר בעברית (he-IL), 0 כשאין */
export const num = (n) => (Number.isFinite(n) ? n : 0).toLocaleString('he-IL')

/** אחוז שלם (0–100) מתוך שני מספרים */
export function pct(part, total) {
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(100, Math.round((100 * (part || 0)) / total)))
}
