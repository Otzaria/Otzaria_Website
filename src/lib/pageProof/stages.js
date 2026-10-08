// שני השלבים של דף המתנדב בהגהת-עמודים (docs/63 §3): קודם "מבנה" (מסגרות ושורות), ורק אחר כך "טקסט".
// לוגיקה טהורה (בלי מסד ובלי DOM). השלב נשמר בטיוטה שבשרת (PageProofDraft.stage), ולכן עובר מחשב ועובר מתנדב.
//
//   מבנה — הסריקה פתוחה (מסגרות, שורות: ציור, פיצול, איחוד, שורה חדשה, "✓ המסגרות נכונות", "✓ החיתוך תקין"), סוג-העמוד;
//           הטקסט לקריאה בלבד ומעומעם, ובסרגל רק מה שנוגע למבנה. בסוף — "✓ המבנה נכון — להגהת הטקסט" (finishStructure):
//           בלי שינוי-חיתוך ← "טקסט" מיד; עם שינוי-חיתוך ← זיהוי-מחדש (העמוד חוזר לאותו מתנדב, לשלב "טקסט") — בלי מנהל
//           כשאפשר, ואחרת לאישור מנהל (recutRules.recutRoute). בשני המקרים העמוד נעול עד שיחזור מהזיהוי-מחדש (בעל הפרויקט,
//           2026-10-06) — אין עוד "ממשיכים לטקסט והשורות נעולות". רק מנהל שדחה את הבקשה מחזיר אותו לשלב "טקסט".
//   טקסט  — עריכת-הטקסט, אישור-פסקה, סגנונות פסקה ותו, קישורים, הצעות, "פגם בדפוס"; כלי הסריקה מוסתרים (לחיצה עליה עדיין
//           מזיזה את הסמן); ההגשה — מכאן.
// העורך המוטמע בתוכנת-הספר אינו מעביר שלב (focus) — שם הכול פתוח, כמו תמיד.

import { CUT_KINDS, bookOnlyLineIds } from './ops.js';
import { cutSuspects } from './cutSuspect.js';

export const STAGES = Object.freeze(['structure', 'text']);
export const isStage = (s) => STAGES.includes(s);
export const STAGE_HE = Object.freeze({ structure: 'מבנה', text: 'טקסט' });

// מה העורך מציג בכל שלב (ProofEditor focus): textReadOnly — הטקסט לקריאה בלבד (ומעומעם — dimText); scanReadOnly — הסריקה
// בלי כלים; hide — קבוצות בסרגל-הכלים שאינן מוצגות (ProofToolbar hide)
const FOCUS = Object.freeze({
  structure: Object.freeze({
    textReadOnly: true,
    dimText: true,
    scanReadOnly: false,
    hide: Object.freeze(['paraStyle', 'charStyles', 'paragraphs', 'link', 'suspicious', 'bookOnly']),
  }),
  text: Object.freeze({ textReadOnly: false, dimText: false, scanReadOnly: true, hide: Object.freeze([]) }),
});
export const stageFocus = (stage) => FOCUS[stage] || null;

// השלב כשהעמוד נפתח בעורך: השמור בטיוטה (בשרת או בדפדפן); טיוטה בלי שלב — מלפני השלבים, כשהעמוד כבר בעבודה ← "טקסט"
// (לא מחזירים מתנדב אחורה); עמוד שחזר מזיהוי-מחדש (גרסה > 1) ← "טקסט"; אחרת — עמוד חדש ← "מבנה".
// saved — השלב השמור; inProgress — יש טיוטה (מקומית או בשרת) עם פעולות; revision — גרסת-העמוד
export function initialStage({ saved = null, inProgress = false, revision = 1 } = {}) {
  if (isStage(saved)) return saved;
  if (inProgress) return 'text';
  if (Number.isInteger(revision) && revision > 1) return 'text';
  return 'structure';
}

export const cutOpsOf = (ops) => (Array.isArray(ops) ? ops.filter((o) => o && !o._local && CUT_KINDS.includes(o.kind)) : []);

// "✓ המבנה נכון — להגהת הטקסט" (וגם "דלג — המבנה נכון"): ← {next: 'text'} / {next: 'recut', cut, ask} — שליחה לזיהוי-מחדש;
// ask — לאישור מנהל (canRecut מהשרת: מתג המנהל, תקרת הבקשות, הגשה של אחר — serverDrafts.editorContext). השרת מכריע
// בעצמו בשליחה (recutRules.recutRoute); ask כאן קובע רק את נוסח הכפתור וההודעה
export function finishStructure({ ops, canRecut = false } = {}) {
  const cut = cutOpsOf(ops);
  if (!cut.length) return { next: 'text' };
  return { next: 'recut', cut, ask: !canRecut };
}

const countKinds = (ops, kinds) => (Array.isArray(ops) ? ops.filter((o) => o && !o._local && kinds.includes(o.kind)).length : 0);

// "במה כבר טיפלתי" — הלוח הקטן ליד הסרגל, לכל שלב (מספרים מהטיוטה): [{key, label, done, title}]
// done: true (✓) / false (עוד לא) / null (מספר בלבד). view — התצוגה (frames_confirmed, cut_ok); approval — {approved, total};
// recut — מהטיוטה ({sentAt, backAt})
export function handledItems(stage, { view = null, ops = [], approval = null, recut = null } = {}) {
  if (stage === 'structure') {
    const out = [
      { key: 'frames', label: 'מסגרות אושרו', done: view?.frames_confirmed === true, title: '"✓ המסגרות נכונות" במצב "מסגרות" של הסריקה' },
      { key: 'cut', label: 'חיתוך נבדק', done: !!view?.cut_ok, title: '"✓ החיתוך בעמוד תקין" במצב "שורות" של הסריקה' },
    ];
    // שורות שהמחשב סימן כחשודות בחיתוך (cutSuspect) — כמה נשארו; מוצג רק בעמוד שיש בו סימון כזה
    const flagged = (view?.lines || []).some((l) => Array.isArray(l?.flags?.cut_suspect) && l.flags.cut_suspect.length);
    if (flagged) {
      const left = cutSuspects(view).size;
      out.push({
        key: 'suspects',
        label: left ? `שורות חשודות בחיתוך: ${left}` : 'שורות חשודות בחיתוך — טופלו',
        done: left === 0,
        title: 'מסומנות באדום במצב "שורות" של הסריקה ("לחשודה הבאה"). שורה שתיקנתם — יורדת; שורה תקינה — "✓ החיתוך בעמוד תקין" בסוף',
      });
    }
    const cut = cutOpsOf(ops).length;
    if (cut) out.push({ key: 'cutFixes', label: `תיקוני-חיתוך: ${cut}`, done: null, title: 'יישלחו לזיהוי-מחדש כשתסיימו את שלב המבנה' });
    if (recut?.sentAt) out.push({ key: 'recut', label: recut.backAt ? 'נשלח לזיהוי-מחדש וחזר' : 'נשלח לזיהוי-מחדש', done: !!recut.backAt, title: null });
    return out;
  }
  if (stage === 'text') {
    const out = [];
    if (approval && approval.total > 0) {
      out.push({ key: 'paras', label: `פסקאות שאושרו ${approval.approved}/${approval.total}`, done: approval.approved >= approval.total, title: null });
    }
    if (recut?.backAt) out.push({ key: 'recut', label: 'חזר מזיהוי-מחדש', done: true, title: 'השורות שנחתכו זוהו מחדש — בדקו אותן (מסומנות בצהוב)' });
    if (recut?.rejectedAt) out.push({ key: 'recut', label: 'המנהל לא אישר זיהוי-מחדש', done: null, title: recut.note || 'תיקוני-החיתוך יוצאים עם ההגשה' });
    const defects = bookOnlyLineIds(ops).length;
    if (defects) out.push({ key: 'defects', label: `שורות עם פגם בדפוס: ${defects}`, done: null, title: 'נכנסות לספר כפי שתיקנתם, ולא לאימון הזיהוי' });
    const styles = countKinds(ops, ['para', 'styles']);
    if (styles) out.push({ key: 'styles', label: `סגנונות שסומנו: ${styles}`, done: null, title: null });
    const links = countKinds(ops, ['link_add', 'link_ok', 'link_del', 'link_reset']);
    if (links) out.push({ key: 'links', label: `קישורים: ${links}`, done: null, title: null });
    return out;
  }
  return [];
}

// הנוסחים
export const STAGE_TEXT = Object.freeze({
  structure: 'שלב 1 — מבנה: בדקו שכל אזור טקסט במסגרת הנכונה ושהשורות חתוכות נכון. הטקסט כאן לקריאה בלבד.',
  text: 'שלב 2 — טקסט: הגיהו את הטקסט פסקה אחר פסקה, ואז הגישו את העמוד.',
  finish: '✓ המבנה נכון — להגהת הטקסט',
  finishRecut: '✓ המבנה נכון — לזיהוי-מחדש',
  finishTitle: 'עוברים לשלב הטקסט. המסגרות והתיקונים שעשיתם נשמרים בטיוטה ויוגשו עם העמוד.',
  finishRecutTitle: 'שיניתם את חיתוך השורות: העמוד יישלח עכשיו לזיהוי-מחדש (בלי מנהל) ויחזור אליכם לשלב הטקסט כשיזוהה מחדש.',
  finishAsk: '✓ המבנה נכון — לאישור זיהוי-מחדש',
  finishAskTitle:
    'שיניתם את חיתוך השורות, ועכשיו העמוד לא יכול לצאת לזיהוי-מחדש בלי מנהל: הוא ימתין לאישור מנהל, נעול, ויחזור אליכם לשלב הטקסט אחרי הזיהוי-מחדש. בינתיים אפשר לתפוס עמודים אחרים.',
  skip: 'דלג — המבנה נכון',
  skipTitle: 'המבנה בעמוד הזה נכון — ישר להגהת הטקסט (לחיצה אחת)',
  back: 'חזרה לשלב המבנה',
  backTitle: 'חזרה למסגרות ולשורות. הטקסט שתיקנתם נשאר.',
  recutSent: 'העמוד נשלח לזיהוי-מחדש — הוא יחזור אליכם לשלב הטקסט כשיזוהה מחדש (תראו אותו ב"העמודים שלי"). שאר התיקונים שמורים בטיוטה.',
  recutAsked: 'העמוד ממתין לאישור מנהל לזיהוי-מחדש, ונעול עד שיחזור מהזיהוי-מחדש (תראו אותו ב"העמודים שלי"). בינתיים אפשר לתפוס עמודים אחרים.',
  recutFailed: (err) => `העמוד לא נשלח לזיהוי-מחדש${err ? ` (${err})` : ''}. הוא נשאר בשלב המבנה — נסו שוב.`,
  recutRejected: (note) =>
    `המנהל לא אישר זיהוי-מחדש לעמוד הזה${note ? `: ${note}` : ''}. הגיהו את הטקסט והגישו את העמוד — תיקוני-החיתוך יוצאים עם ההגשה, והשורות שנחתכו נעולות עד אז.`,
});
