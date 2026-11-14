// צורת הדף — הסכמה בין מתנדבים על החלטת נוסח (PACKAGE.md §2). טהור.
//
// שתי תשובות של שני משתמשים שונים עם אותו verdict (וב-`other` אותו טקסט אחרי נרמול) ← agreed.
// שתי תשובות מכריעות שונות ← disputed. `unclear` אינו הכרעה: אחד לא סוגר, שניים ← disputed.

export const VERDICTS = Object.freeze(['print', 'otz', 'other', 'elsewhere', 'unclear']);
export const isVerdict = (v) => VERDICTS.includes(v);

const PUNCT = new Set(['־', '׀', '׃', '׆']);

// נרמול טקסט להשוואה: בלי ניקוד וטעמים (U+0591–U+05C7), גרשיים ומירכאות אחידים, רווחים מכווצים
export function normalizeText(s) {
  return String(s ?? '')
    // סימני הפיסוק שבטווח (מקף, פסק, סוף פסוק, נו"ן הפוכה) נשארים — הם אינם ניקוד
    .replace(/[֑-ׇ]/g, (ch) => (PUNCT.has(ch) ? ch : ''))
    .replace(/[״“”„‟″"]/g, '"')
    .replace(/[׳‘’‚‛′'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// מפתח השוואה של תשובה
export const answerKey = (a) => (a?.verdict === 'other' ? `other:${normalizeText(a.text)}` : String(a?.verdict || ''));

/**
 * answers: [{user, verdict, text}] לפי סדר ההגעה (תשובה אחת למשתמש).
 * ← {status: 'open'|'agreed'|'disputed', verdict, text, agreers:[user]}
 * agreed — הזוג המסכים הראשון (לפי הסדר); agreers — כל מי שענה אותה הכרעה.
 */
export function consensus(answers) {
  const list = [];
  const seen = new Set();
  for (const a of Array.isArray(answers) ? answers : []) {
    const u = String(a?.user ?? '');
    if (!u || seen.has(u) || !isVerdict(a?.verdict)) continue;
    seen.add(u);
    list.push(a);
  }
  const decisive = list.filter((a) => a.verdict !== 'unclear');
  const groups = new Map();
  for (const a of decisive) {
    const k = answerKey(a);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  // הקבוצה שהגיעה ראשונה לשתי תשובות
  let best = null;
  let bestAt = Infinity;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const at = decisive.indexOf(g[1]);
    if (at < bestAt) {
      best = g;
      bestAt = at;
    }
  }
  if (best) {
    const first = best[0];
    return {
      status: 'agreed',
      verdict: first.verdict,
      // הטקסט כפי שנכתב בתשובה הראשונה (רק רווחים מכווצים) — הנרמול הוא רק להשוואה
      text: first.verdict === 'other' ? String(first.text ?? '').replace(/\s+/g, ' ').trim() : null,
      agreers: best.map((a) => String(a.user)),
    };
  }
  const unclear = list.length - decisive.length;
  if (groups.size >= 2 || unclear >= 2) return { status: 'disputed', verdict: null, text: null, agreers: [] };
  return { status: 'open', verdict: null, text: null, agreers: [] };
}
