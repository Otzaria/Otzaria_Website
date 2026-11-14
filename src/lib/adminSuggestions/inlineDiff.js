// תצוגת "טקסט אחד" בהצעות עריכה (library/DiffPreview): במקום שתי תיבות (ישן / חדש) — הטקסט פעם אחת,
// ובכל מקום שהשתנה המילה הישנה מחוקה ומיד אחריה החדשה. לוגיקה טהורה (נבדק ב-inlineDiff.test.mjs).
// הקלט — המקטעים של diffWords (lib/dicta/text-diff), שהאלגוריתם שלו לא משתנה כאן.

/**
 * מעל השיעור הזה של מילים שהשתנו — חוזרים לשתי תיבות. 0.6 = פחות מ-40% מהמילים נשארו כמו שהן: אז הטקסט
 * המעורב הוא בעיקר מחוק-חדש-מחוק-חדש, וקשה לקרוא בו גם את הישן וגם את החדש. עד הסף — רוב הטקסט רציף, והשינויים
 * בולטים בתוכו. diffWords שנפל לבלוק גס (טקסט ענק) מחזיר הכל כשינוי (100%), ולכן תמיד נופל לשתי תיבות.
 */
export const SPLIT_RATIO = 0.6

/**
 * קטע קצר (פחות מ-12 מילים בשני הנוסחים יחד, כ-6 בכל צד) — תמיד טקסט אחד, גם אם השתנה כולו: "~~שרש~~ שורש"
 * קריא בשורה אחת, ושתי תיבות למילה אחת הן סתם רעש.
 */
export const MIN_WORDS_FOR_SPLIT = 12

const countWords = (text) => (String(text).match(/\S+/g) || []).length
const isBridge = (seg) => seg.type === 'equal' && /^[^\S\n]+$/.test(seg.text)

/**
 * כמה מהמילים השתנו: (נמחקו + נוספו) / (כל המילים בשני הנוסחים). מילה שלא השתנתה נספרת פעמיים — פעם בכל נוסח.
 * @param {Array<{type:'equal'|'del'|'add', text:string}>} segs
 * @returns {{ ratio: number, words: number }}
 */
export function changeStats(segs) {
  let equal = 0, changed = 0
  for (const s of segs || []) {
    const n = countWords(s.text)
    if (s.type === 'equal') equal += n
    else changed += n
  }
  const words = equal * 2 + changed
  return { ratio: words ? changed / words : 0, words }
}

/**
 * איך להציג הצעה: 'inline' (טקסט אחד) או 'split' (שתי תיבות). צד ריק (רק הוספה / רק מחיקה) — תמיד טקסט אחד,
 * כי יש בו רק נוסח אחד ממילא.
 * @param {{ before?: string, after?: string }} change
 * @param {Array<{type:'equal'|'del'|'add', text:string}>} segs
 * @returns {'inline' | 'split'}
 */
export function suggestionLayout(change, segs) {
  if (!change?.before || !change?.after) return 'inline'
  const { ratio, words } = changeStats(segs)
  return words >= MIN_WORDS_FOR_SPLIT && ratio > SPLIT_RATIO ? 'split' : 'inline'
}

/** רווחים בקצוות יוצאים מחוץ לסימון — כדי שהקו החוצה / התחתון לא יימשך על הרווח */
function splitEdges(text) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
  return { lead: m[1], core: m[2], trail: m[3] }
}

/**
 * מקבץ את המקטעים לטקסט אחד: קטעים ללא שינוי, ו"שינויים" — מה שנמחק ומה שנוסף באותו מקום, זה לצד זה.
 * שינויים שמפריד ביניהם רק רווח (בלי ירידת שורה) מתאחדים לשינוי אחד: "~~משה ואהרן~~ יהושע וכלב" ולא
 * "~~משה~~ יהושע ~~ואהרן~~ וכלב". רווחים בקצוות השינוי יוצאים ממנו (lead / trail), כך שהטקסט נשמר כמו שהוא.
 * @param {Array<{type:'equal'|'del'|'add', text:string}>} segs
 * @returns {Array<{type:'equal', text:string} | {type:'change', lead:string, del:string, add:string, trail:string}>}
 */
export function inlineGroups(segs) {
  const list = segs || []
  const out = []
  let i = 0
  while (i < list.length) {
    if (list[i].type === 'equal') { out.push({ type: 'equal', text: list[i].text }); i++; continue }
    // רצף של מחיקות / הוספות, כולל רווחים שמחברים בין שינויים
    let del = '', add = ''
    while (i < list.length) {
      const s = list[i]
      if (s.type === 'del') del += s.text
      else if (s.type === 'add') add += s.text
      else if (isBridge(s) && list[i + 1] && list[i + 1].type !== 'equal') { del += s.text; add += s.text }
      else break
      i++
    }
    const d = splitEdges(del)
    const a = splitEdges(add)
    out.push({
      type: 'change',
      lead: d.core ? d.lead : a.lead,
      del: d.core,
      add: a.core,
      trail: a.core ? a.trail || d.trail : d.trail,
    })
  }
  return out
}
