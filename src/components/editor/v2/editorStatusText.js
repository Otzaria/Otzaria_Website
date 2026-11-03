// טקסטים ונתונים מחושבים לרכיבי העורך החדש (כותרת, שורת מצב, סיום עמוד) — לוגיקה טהורה,
// בלי React ובלי שעון אמיתי (now מועבר מבחוץ). בדיקות: editorStatusText.test.js.

const MINUTE = 60_000

/** מספר בעברית לתצוגה (פסיק אלפים) */
export function formatCount(n) {
  return Number(n || 0).toLocaleString('he-IL')
}

/** "נשמר לפני רגע" / "לפני 5 דק׳" / "בשעה 14:05" — לפי הזמן שעבר מ-lastSavedAt */
export function savedAgoText(lastSavedAt, now = Date.now()) {
  if (lastSavedAt == null) return 'נשמר'
  const at = new Date(lastSavedAt).getTime()
  if (!Number.isFinite(at)) return 'נשמר'
  const diff = Math.max(0, now - at)
  if (diff < MINUTE) return 'נשמר לפני רגע'
  const minutes = Math.floor(diff / MINUTE)
  if (minutes < 60) return minutes === 1 ? 'נשמר לפני דקה' : `נשמר לפני ${minutes} דק׳`
  const time = new Date(at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `נשמר בשעה ${time}`
}

export const SAVE_STATUSES = ['saved', 'saving', 'dirty', 'error']

/**
 * מצב השמירה לתצוגה: טקסט, אייקון וגוון.
 * @param {'saved'|'saving'|'dirty'|'error'} status
 */
export function saveStatusInfo(status, lastSavedAt, now = Date.now()) {
  switch (status) {
    case 'saving':
      return { text: 'שומר…', icon: 'cloud_sync', tone: 'neutral' }
    case 'dirty':
      return { text: 'יש שינויים שלא נשמרו', icon: 'edit_note', tone: 'neutral' }
    case 'error':
      return { text: 'השמירה נכשלה', icon: 'sync_problem', tone: 'error' }
    case 'saved':
    default:
      return { text: savedAgoText(lastSavedAt, now), icon: 'check_circle', tone: 'success' }
  }
}

/** רמות המעקב, מהמדויקת לפשוטה */
export const TRACKING_LEVELS = ['word', 'line', 'ruler', 'off']

const LEVEL_LABELS = {
  word: 'מעקב מילה',
  line: 'מעקב שורה',
  ruler: 'סרגל ידני',
  off: 'מעקב כבוי'
}

const LEVEL_HINTS = {
  word: 'יש מיקום לכל מילה. מסגרת על המילה בצילום.',
  line: 'השורות זוהו מהתמונה. מיקום המילה משוער.',
  ruler: 'לא זוהו שורות. פס שאתה מזיז, כמו סרגל על דף.',
  off: 'אפשר להפעיל את המעקב בהגדרות התצוגה.'
}

const SOURCE_LABELS = {
  layout: 'מזיהוי הטקסט',
  proof: 'מעמוד ההגהה',
  local: 'מזיהוי בדפדפן',
  profile: 'מניתוח התמונה',
  manual: 'ידני'
}

/** הסבר כשהרמה הורדה כי הפריסה שזוהתה מהתמונה לא סבירה (trackingPlausibility) */
export const DOWNGRADED_HINT = 'הפריסה בעמוד הזה (טורים, פירוש מסביב או טקסט חלקי) לא זוהתה בבטחה מהתמונה, ולכן לא מסומנת מילה. "זהה מילים בעמוד" יזהה את המילים עצמן.'

/**
 * @param {{ level?: string, source?: string, estimated?: boolean, downgraded?: boolean }} tracking
 * @returns {{ level: string, label: string, sourceLabel: string | null, hint: string, full: string }}
 */
export function trackingInfo(tracking = {}) {
  const level = TRACKING_LEVELS.includes(tracking.level) ? tracking.level : 'off'
  const sourceLabel = level === 'off' ? null : SOURCE_LABELS[tracking.source] ?? null
  const down = Boolean(tracking.downgraded) && (level === 'line' || level === 'off')
  let label = LEVEL_LABELS[level]
  if (down) label += ' · הפריסה לא זוהתה בבטחה'
  else if (level === 'line') label += ' · מיקום המילה משוער'
  else if (level === 'word' && tracking.estimated) label += ' · מילה לא זוהתה, מיקום משוער'
  const full = sourceLabel ? `${label} (${sourceLabel})` : label
  return { level, label, sourceLabel, hint: down ? DOWNGRADED_HINT : LEVEL_HINTS[level], full }
}

/** "שורה 4 מתוך 20 · מילה 153 מתוך 420" — המילה נספרת בכל הדף; בלי ספירת דף — המילה בשורה */
export function positionText({ line, totalLines, word, pageWord, totalWords } = {}) {
  if (!line) return ''
  let text = totalLines ? `שורה ${line} מתוך ${totalLines}` : `שורה ${line}`
  if (pageWord && totalWords) text += ` · מילה ${formatCount(pageWord)} מתוך ${formatCount(totalWords)}`
  else if (word) text += ` · מילה ${word}`
  return text
}

export function wordCountText(count) {
  if (count === 1) return 'מילה אחת'
  return `${formatCount(count)} מילים`
}

export function suspectCountText(count) {
  if (!count) return 'אין מילים לבדיקה'
  if (count === 1) return 'מילה אחת לבדיקה'
  return `${formatCount(count)} מילים לבדיקה`
}

/** ספירה לאחור עד הפסקת העיניים: "בעוד 12 ד׳" / "בעוד פחות מדקה" / "עכשיו" */
export function restCountdownText(msRemaining) {
  if (msRemaining == null || !Number.isFinite(msRemaining)) return ''
  if (msRemaining <= 0) return 'הפסקת עיניים עכשיו'
  if (msRemaining < MINUTE) return 'הפסקת עיניים בעוד פחות מדקה'
  return `הפסקת עיניים בעוד ${Math.ceil(msRemaining / MINUTE)} ד׳`
}

/**
 * הבדיקות בחלון "סיום עמוד". כל בדיקה: { id, ok, icon, title, detail, action? }.
 * ok=false אינו חוסם את הסיום — רק מתריע.
 *
 * @param {{ suspectCount?: number, textLineCount?: number, scanLineCount?: number | null,
 *   saveStatus?: string, lastSavedAt?: Date | number | string | null, now?: number }} input
 */
export function buildFinishChecks({ suspectCount = 0, textLineCount = 0, scanLineCount = null, saveStatus = 'saved', lastSavedAt = null, now = Date.now() } = {}) {
  const checks = []

  checks.push({
    id: 'suspects',
    ok: suspectCount === 0,
    icon: suspectCount === 0 ? 'check' : 'spellcheck',
    title: suspectCount === 0
      ? 'כל המילים החשודות נבדקו'
      : suspectCount === 1 ? 'מילה חשודה אחת לא נבדקה' : `${formatCount(suspectCount)} מילים חשודות לא נבדקו`,
    detail: 'מילים שזיהוי הטקסט לא היה בטוח בהן.',
    action: suspectCount > 0 ? 'suspects' : undefined
  })

  const known = typeof scanLineCount === 'number' && scanLineCount > 0
  checks.push({
    id: 'lines',
    ok: !known || textLineCount === scanLineCount,
    icon: 'format_list_numbered',
    title: !known
      ? `${formatCount(textLineCount)} שורות בטקסט`
      : textLineCount === scanLineCount
        ? `כל ${formatCount(scanLineCount)} השורות שבצילום הוקלדו`
        : `${formatCount(textLineCount)} שורות בטקסט, ${formatCount(scanLineCount)} בצילום`,
    detail: known ? 'שורה מול שורה, לפי הצילום.' : 'מספר השורות בצילום לא ידוע.'
  })

  const save = {
    saved: { ok: true, icon: 'check_circle', title: 'הכול נשמר', detail: lastSavedAt == null ? '' : savedAgoText(lastSavedAt, now).replace(/^נשמר/, 'השמירה האחרונה') + '.' },
    saving: { ok: true, icon: 'cloud_sync', title: 'שומר…', detail: 'השמירה תסתיים לפני המעבר לעמוד הבא.' },
    dirty: { ok: false, icon: 'edit_note', title: 'יש שינויים שלא נשמרו', detail: 'הם יישמרו עם סיום העמוד.' },
    error: { ok: false, icon: 'sync_problem', title: 'השמירה האחרונה נכשלה', detail: 'העמוד יישמר שוב עם הסיום. אם זה נכשל שוב, העתק את הטקסט לפני שתמשיך.' }
  }[saveStatus] ?? { ok: true, icon: 'check_circle', title: 'הכול נשמר', detail: '' }
  checks.push({ id: 'save', ...save })

  return checks
}
