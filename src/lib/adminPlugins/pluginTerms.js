// הניסוח של מסך התוספים בניהול — מקום אחד לשמות, למצבים ולטקסטים של חלונות האישור וההודעות, לפי
// מילון השמות של הניהול (סעיף 6: אשר / דחה / השהה / החזר לחנות / החזר להמתנה / מחק לצמיתות).
// לוגיקה טהורה; טסט: pluginTerms.test.mjs.
//
// מה כל פעולה עושה בשרת (כמו היום — הניסוח מתאר את ההתנהגות, לא משנה אותה):
//   DELETE — אותה נקודת קצה ל"דחה" ול"מחק לצמיתות", והיא מחליטה לפי התוסף, לא לפי הכפתור:
//     תוסף בחנות עם עדכון שממתין (isApproved + pendingUpdate) — נמחק רק העדכון, והתוסף נשאר בחנות.
//     כל מקרה אחר — התוסף נמחק כולו: קבצים, כל הגרסאות, ומהקטגוריות ומהנבחרים. גם תוסף ותיק שהוחזר להמתנה.
//     בשני המקרים אין "נדחה" שנשמר, ואין הודעה למפתח. אי אפשר לשחזר.
//   אשר (approve)  — המפתח מקבל הודעה במייל. גם אחרי "החזר להמתנה". לא מבטל השהיה.
//     עדכון עם מספר גרסה גבוה יותר — הגרסה הקודמת נשמרת ב"גרסאות". אחרת — הקובץ הקיים נדרס ולא נשמר.
//   החזר להמתנה (unapprove) — התוסף יוצא מהחנות וחוזר לתור "לאישור". אפשר להחזיר (אשר שוב). בלי הודעה
//     למפתח. עדכון שממתין נשאר, ומעכשיו "דחה" כבר לא מוחק רק אותו (ראו DELETE).
//   השהה / החזר לחנות (suspend / resume) — האישור נשמר; התוסף פשוט לא מוצג. אפשר להחזיר. השהיה מהניהול
//     נועלת את המפתח: הוא לא יכול להחזיר בעצמו.
import { formatPluginStatus } from '../pluginStatus.js'
import { compareVersions } from '../semverCompare.js'
import { reviewSource, submissionKind } from './pluginsQuery.js'
import { bulkProgressText as bulkProgressLine } from '../adminList/bulkText.js'
import { fileSizeText as sizeText } from '../adminList/fileSize.js'

const n = (value) => Number(value || 0).toLocaleString('he-IL')

/** "”שם”" — בתוך משפט */
export const quoted = (name) => `״${name || 'תוסף בלי שם'}״`

/** השם להצגה — גם כשחסר (תוסף בלי שם לא אמור להגיע מהשרת, אבל "undefined" לא יגיע למסך) */
export const displayName = (plugin) => plugin?.name || 'תוסף בלי שם'

const KIND_BADGES = {
  new: { label: 'חדש', tone: 'primary' },
  update: { label: 'עדכון', tone: 'neutral' },
  returned: { label: 'הוחזר להמתנה', tone: 'warning' },
}

/** תג הסוג בתור */
export function kindBadge(plugin) {
  return KIND_BADGES[submissionKind(plugin)]
}

/** שם הפעולה של "אשר" */
export function approveLabel(plugin) {
  return { new: 'אשר', update: 'אשר עדכון', returned: plugin?.pendingUpdate ? 'אשר והחזר לחנות' : 'אשר' }[submissionKind(plugin)]
}

/** שם הפעולה של "דחה", לפי מה שהיא באמת תמחק */
export function rejectLabel(plugin) {
  return { new: 'דחה', update: 'דחה את העדכון', returned: 'מחק לצמיתות' }[submissionKind(plugin)]
}

/**
 * הגרסה בתור: next — מה שהוגש; prev — בעדכון עם מספר אחר, הגרסה שבחנות היום (מוצג "1.3.0 במקום 1.2.0" —
 * בלי חץ, שכיוונו מתבלבל בין עברית למספרים); same — עדכון באותו מספר.
 */
export function versionParts(plugin) {
  const next = reviewSource(plugin).version || plugin?.version || ''
  const changing = Boolean(plugin?.pendingUpdate && plugin.version)
  return { next, prev: changing && plugin.version !== next ? plugin.version : null, same: changing && plugin.version === next }
}

/** רמת היציבות שהמפתח הצהיר (יציב / בטא / ניסיוני) — תג רק כשאינה "יציב" (ברירת המחדל) */
export function stabilityBadge(status) {
  if (!status || status === 'stable') return null
  return { label: formatPluginStatus(status) || status, tone: status === 'experimental' ? 'warning' : 'neutral' }
}

/** מצב בחנות: מוצג, או מושהה — ומי השהה (השהיית הניהול גוברת: רק מכאן אפשר להחזיר) */
export function storeState(plugin) {
  if (plugin?.isSuspended !== true) return { kind: 'active', label: 'מוצג בחנות', short: null }
  const byAdmin = plugin.suspendedByRole === 'admin'
  const label = byAdmin ? 'מושהה על ידי הניהול' : 'מושהה על ידי המפתח'
  return { kind: 'suspended', label, short: byAdmin ? 'מושהה' : label }
}

/** המפתח השהה בעצמו: החזרה מהניהול דורסת את ההחלטה שלו */
export function suspendedByOwner(plugin) {
  return plugin?.isSuspended === true && plugin.suspendedByRole !== 'admin'
}

/** דירוג ממוצע: "4.6" */
export function ratingAverage(value) {
  return (value || 0).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** "4.6 · 12 דירוגים" / "אין דירוגים" */
export function ratingText(plugin) {
  const count = plugin?.ratingCount || 0
  if (count === 0) return 'אין דירוגים'
  return `${ratingAverage(plugin.ratingAvg)} · ${count === 1 ? 'דירוג אחד' : `${n(count)} דירוגים`}`
}

export function downloadsText(count) {
  const value = count || 0
  if (value === 0) return 'לא הורד עדיין'
  return value === 1 ? 'הורדה אחת' : `${n(value)} הורדות`
}

export function pluginsCountText(count) {
  return count === 1 ? 'תוסף אחד' : `${n(count)} תוספים`
}

/** הגרסאות הקודמות — מהחדשה לישנה */
export function sortedVersions(plugin) {
  return [...(plugin?.versions || [])].sort((a, b) => (Date.parse(b.archivedAt) || 0) - (Date.parse(a.archivedAt) || 0))
}

/** גודל קובץ קריא */
export function fileSizeText(bytes) {
  const b = Number(bytes) || 0
  if (b <= 0) return ''
  return sizeText(b)
}

// ---------- חלונות אישור ----------

/** מה נמחק עם התוסף כולו: "14 גרסאות, 3,076 הורדות ו-2 דירוגים" */
export function historyText(plugin) {
  const versions = (plugin?.versions?.length || 0) + 1
  const parts = [versions === 1 ? 'גרסה אחת' : `${n(versions)} גרסאות`]
  if (plugin?.downloadCount > 0) parts.push(downloadsText(plugin.downloadCount))
  if (plugin?.ratingCount > 0) parts.push(plugin.ratingCount === 1 ? 'דירוג אחד' : `${n(plugin.ratingCount)} דירוגים`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ו${/^\d/.test(parts.at(-1)) ? '-' : ''}${parts.at(-1)}` : parts[0]
}

/** "דחה" — לפי מה שהשרת ימחק: העדכון בלבד, הגשה חדשה, או תוסף ותיק שלם (ראו DELETE למעלה) */
export function rejectConfirm(plugin) {
  const kind = submissionKind(plugin)
  const name = quoted(reviewSource(plugin).name || plugin?.name)
  if (kind === 'update') {
    return {
      title: 'לדחות את העדכון?',
      body: `העדכון של ${name} יימחק ולא יישמר. הגרסה שבחנות היום נשארת כמו שהיא.`,
      details: ['ההגשה תימחק — אין רשימה של עדכונים שנדחו.', 'המפתח לא מקבל הודעה על הדחייה. אפשר לכתוב לו ב"הודעות".', 'אי אפשר לבטל את זה.'],
      confirmLabel: 'דחה ומחק את העדכון',
      tone: 'danger',
    }
  }
  if (kind === 'returned') {
    return {
      title: 'למחוק את התוסף לצמיתות?',
      body: `${name} הוחזר להמתנה, והוא לא בחנות. לכן זו לא דחייה של הגשה: התוסף כולו יימחק.`,
      details: [
        `יימחקו ${historyText(plugin)}, עם כל הקבצים.`,
        ...(plugin?.pendingUpdate ? ['גם העדכון שממתין יימחק. אין גרסה שנשארת בחנות.'] : []),
        'התוסף יוסר מהקטגוריות ומהנבחרים.',
        'המפתח לא מקבל הודעה על המחיקה.',
        'אי אפשר לשחזר.',
        'אם רק לא רוצים שיוצג — אין צורך למחוק: כל עוד לא אישרת אותו, הוא לא בחנות. אפשר גם לאשר ואז "השהה" (המפתח יקבל מייל על האישור).',
      ],
      confirmLabel: 'מחק לצמיתות',
      tone: 'danger',
    }
  }
  return {
    title: 'לדחות את התוסף?',
    body: `ההגשה של ${name} תימחק, יחד עם הקבצים שהועלו.`,
    details: ['ההגשה לא נשמרת בשום מקום — אין רשימה של תוספים שנדחו.', 'המפתח לא מקבל הודעה על הדחייה. אפשר לכתוב לו ב"הודעות".', 'אי אפשר לבטל את זה. המפתח יכול להגיש שוב.'],
    confirmLabel: 'דחה ומחק את ההגשה',
    tone: 'danger',
  }
}

/** השורה שליד "דחה" במגירה */
export function rejectNote(plugin) {
  return {
    new: 'ההגשה תימחק, יחד עם הקבצים.',
    update: 'העדכון יימחק ולא יישמר. הגרסה שבחנות נשארת.',
    returned: `התוסף לא בחנות, ולכן המחיקה כוללת אותו כולו: ${historyText(plugin)}.`,
  }[submissionKind(plugin)]
}

/** ההודעה אחרי "דחה" */
export function rejectedMessage(plugin) {
  const name = quoted(reviewSource(plugin).name || plugin?.name)
  return {
    new: `ההגשה של ${name} נדחתה ונמחקה`,
    update: `העדכון של ${name} נדחה ונמחק. התוסף נשאר בחנות`,
    returned: `${name} נמחק לצמיתות`,
  }[submissionKind(plugin)]
}

/** ההודעה אחרי "אשר". תוסף מושהה נשאר מושהה, גם אחרי אישור */
export function approvedMessage(plugin) {
  const kind = submissionKind(plugin)
  const name = quoted(reviewSource(plugin).name || plugin?.name)
  if (plugin?.isSuspended === true) return `${name} אושר, אבל עדיין מושהה ולא מוצג בחנות`
  if (kind === 'update') return `העדכון של ${name} אושר`
  return kind === 'returned' ? `${name} אושר וחזר לחנות` : `${name} אושר ומוצג בחנות`
}

/**
 * "אשר" לעדכון שממתין (לתוסף חדש — חלון השיבוץ, PluginApproveModal). הגרסה הקודמת נשמרת ב"גרסאות" רק
 * כשמספר הגרסה עולה (כך בשרת); אחרת הקובץ הקיים נדרס, וזה בדיוק מה שהמנהל צריך לדעת לפני שהוא מאשר.
 */
export function approveUpdateConfirm(plugin) {
  const source = reviewSource(plugin)
  const name = quoted(source.name)
  const version = source.version || ''
  const raised = compareVersions(version, plugin?.version) > 0
  const same = version === plugin?.version
  const archive = raised
    ? `גרסה ${plugin?.version} תישמר ב"גרסאות", ואפשר יהיה להוריד אותה.`
    : same
      ? `מספר הגרסה לא השתנה (${version}). הקובץ הקיים יוחלף ולא יישמר.`
      : `מספר הגרסה לא עלה (${version} במקום ${plugin?.version}). הקובץ הקיים יוחלף ולא יישמר.`
  if (submissionKind(plugin) === 'returned') {
    return {
      title: 'להחזיר את התוסף לחנות?',
      body: `${name} הוחזר להמתנה, ויש לו עדכון שממתין. אישור יחזיר אותו לחנות בגרסה ${version}.`,
      details: [archive, 'המפתח יקבל הודעה במייל.'],
      confirmLabel: 'אשר והחזר לחנות',
    }
  }
  return {
    title: 'לאשר את העדכון?',
    body: same ? `${name} יתעדכן בחנות, באותה גרסה.` : `${name} יתעדכן בחנות לגרסה ${version}.`,
    details: [archive, 'המפתח יקבל הודעה במייל.'],
    confirmLabel: 'אשר עדכון',
  }
}

/**
 * "השהה" / "החזר לחנות" — אפשר להחזיר, ולכן בלי חלון אישור: הודעה עם "בטל" (הפעולה ההפוכה).
 * @param {'suspend' | 'resume'} action
 */
export function suspendMessage(action, plugins) {
  const list = plugins || []
  if (list.length === 1) {
    return action === 'suspend'
      ? `${quoted(list[0].name)} הושהה ולא מוצג בחנות`
      : `${quoted(list[0].name)} חזר לחנות`
  }
  return action === 'suspend' ? `${pluginsCountText(list.length)} הושהו ולא מוצגים בחנות` : `${pluginsCountText(list.length)} חזרו לחנות`
}

/**
 * הסיכום של פעולה מרובה: מה נעשה, מה נכשל, מה נעצר ומה דולג — במספרים, כמו בספרים.
 * @param {'suspend' | 'resume' | 'assign'} action
 * @param {{ done: number, failed?: number, stopped?: number, skipped?: number, unchanged?: number,
 *   failedNames?: string[], category?: string }} result
 * @returns {{ message: string, tone: 'success' | 'info' | 'error' }}
 */
export function bulkResultText(action, { done, failed = 0, stopped = 0, skipped = 0, unchanged = 0, failedNames = [], category }) {
  const one = done === 1
  const verb = {
    suspend: one ? 'הושהה ולא מוצג בחנות' : 'הושהו ולא מוצגים בחנות',
    resume: one ? 'חזר לחנות' : 'חזרו לחנות',
    assign: one ? `שובץ ב${quoted(category)}` : `שובצו ב${quoted(category)}`,
  }[action]
  const parts = []
  if (done > 0) parts.push(`${pluginsCountText(done)} ${verb}.`)
  if (failed > 0) {
    const names = failedNames.length > 0 && failedNames.length <= 3 ? ` (${failedNames.map(quoted).join(', ')})` : ''
    parts.push(`${failed === 1 ? 'תוסף אחד לא עודכן' : `${pluginsCountText(failed)} לא עודכנו`}${names}. נסה שוב.`)
  }
  if (stopped > 0) parts.push(`נעצר: ${stopped === 1 ? 'תוסף אחד לא עודכן' : `${pluginsCountText(stopped)} לא עודכנו`}.`)
  if (skipped > 0) parts.push(`${skipped === 1 ? 'תוסף אחד דולג' : `${pluginsCountText(skipped)} דולגו`}: המפתח השהה אותו בעצמו. אפשר להחזיר מהתפריט של השורה.`)
  if (parts.length === 0 && unchanged > 0) {
    parts.push({
      suspend: 'כל הנבחרים כבר מושהים.',
      resume: 'כל הנבחרים כבר מוצגים בחנות.',
      assign: `כל הנבחרים כבר ב${quoted(category)}.`,
    }[action])
  }
  const tone = failed > 0 ? 'error' : done > 0 && stopped === 0 && skipped === 0 ? 'success' : 'info'
  return { message: parts.join(' '), tone }
}

/** מה הפעולה המרובה עושה עכשיו: "משהה… 3 מתוך 12" */
export function bulkProgressText(action, { done, total }) {
  const verb = { suspend: 'משהה', resume: 'מחזיר לחנות', assign: 'משבץ' }[action] || 'מעדכן'
  return bulkProgressLine(verb, { done, total })
}

/** "החזר לחנות" על תוסף שהמפתח השהה בעצמו — שואלים, כי זו דריסה של ההחלטה שלו */
export function resumeOwnerConfirm(plugin) {
  return {
    title: 'להחזיר לחנות תוסף שהמפתח השהה?',
    body: `המפתח השהה את ${quoted(plugin?.name)} בעצמו. אם תחזיר אותו, הוא יוצג בחנות שוב.`,
    details: ['המפתח לא מקבל הודעה על זה.', 'השהיה מהניהול אחרי זה תנעל אותו: הוא לא יוכל להחזיר את התוסף בעצמו.'],
    confirmLabel: 'החזר לחנות',
  }
}

/** "החזר להמתנה" — יוצא מהחנות וחוזר לתור "לאישור" */
export function unapproveConfirm(plugin) {
  return {
    title: 'להחזיר את התוסף להמתנה?',
    body: `${quoted(plugin?.name)} ייצא מהחנות ויחזור לרשימה "לאישור".`,
    details: [
      'כדי שיחזור לחנות — צריך לאשר אותו שוב. אז המפתח יקבל מייל שהתוסף אושר.',
      'על ההחזרה עצמה המפתח לא מקבל הודעה.',
      'השיבוץ בקטגוריות נשאר.',
      ...(plugin?.pendingUpdate ? ['יש לתוסף עדכון שממתין. אחרי ההחזרה, דחייה שלו תמחק את כל התוסף, לא רק את העדכון.'] : []),
    ],
    confirmLabel: 'החזר להמתנה',
  }
}

/** "מחק לצמיתות" — תוסף מהחנות בלי עדכון שממתין: הכול נמחק (עם עדכון שממתין השרת מוחק רק אותו — rejectConfirm) */
export function deleteForeverConfirm(plugin) {
  return {
    title: 'למחוק את התוסף לצמיתות?',
    body: `${quoted(plugin?.name)} יימחק מהחנות ומהאתר.`,
    details: [
      `יימחקו ${historyText(plugin)}, עם הקבצים וצילומי המסך.`,
      'התוסף יוסר מהקטגוריות ומהנבחרים.',
      'אי אפשר לשחזר. אם רק צריך להוריד אותו מהחנות — "השהה".',
    ],
    confirmLabel: 'מחק לצמיתות',
    tone: 'danger',
  }
}

/** מחיקת גרסה ישנה אחת */
export function deleteVersionConfirm(plugin, version) {
  return {
    title: `למחוק את גרסה ${version}?`,
    body: `הקובץ של גרסה ${version} של ${quoted(plugin?.name)} יימחק.`,
    details: ['הגרסה שבחנות לא משתנה.', 'אי אפשר לשחזר.'],
    confirmLabel: 'מחק גרסה',
    tone: 'danger',
  }
}

/** הסתרת דירוג — אפשר להחזיר, לכן בלי שאלה; ההודעה עם "בטל" */
export function ratingHiddenMessage(rating) {
  return `הדירוג של ${rating?.userName || 'המשתמש'} הוסתר — הוא לא נספר בממוצע`
}
