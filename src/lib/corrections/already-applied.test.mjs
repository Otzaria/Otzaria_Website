/**
 * הכלל של סגירה אוטומטית ל"כבר הוחל" (already-applied.js) — בדיקות טהורות. התרחישים A/A2/B מבקרת
 * PR #313: טעות שזזה, כותרת שחוזרת ומחיקה — נראים כמו תיקון שהוחל ואסור לסגור אותם.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLine } from './resolver.js';
import { visibleLength, isDistinctiveLine, isExactlyApplied } from './already-applied.js';

const fullLine = (originalLine, proposedText) => ({ originalLine, originalSelection: null, proposedText, contextBefore: '', contextAfter: '' });

// כמו resolveSource: מקור מתוצאת matchLine על תוכן הקובץ
function sourceFor(content, { lineIndex, original, proposed }) {
  const m = matchLine(content, { originalLine: original, lineIndex, newLine: proposed });
  return {
    status: m.status, lineIndex: m.lineIndex, currentLine: m.currentLine, bomAdjusted: m.originalLine !== undefined && m.originalLine !== original,
    occurrences: m.occurrences ?? null, located: m.located ?? null,
  };
}
const closes = (content, args) => isExactlyApplied(sourceFor(content, args), fullLine(args.original, args.proposed));
const L = (arr) => `${arr.join('\n')}\n`;

test('תווים נראים: בלי תגיות, רווחים וניקוד/טעמים; שורה ייחודית — לא ריקה, לא כותרת, לא תגיות בלבד, ≥15', () => {
  assert.equal(visibleLength('(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים'), 17);
  assert.equal(visibleLength('<br/><hr>'), 0);
  assert.equal(isDistinctiveLine(''), false);
  assert.equal(isDistinctiveLine('   \t'), false);
  assert.equal(isDistinctiveLine('<h3>הלכות שבת פרק ראשון ארוך מאוד</h3>'), false, 'כותרת — לעולם לא');
  assert.equal(isDistinctiveLine('  <H2 class="x">כותרת ארוכה מספיק בהחלט כאן</H2>'), false);
  assert.equal(isDistinctiveLine('<b></b><i> </i>'), false, 'תגיות בלבד');
  assert.equal(isDistinctiveLine('אבג דהו זחט יכל מנ'), false, '14 תווים נראים');
  assert.equal(isDistinctiveLine('אבג דהו זחט יכל מנס'), true, '15 תווים נראים');
  assert.equal(isDistinctiveLine('<hr>אבג דהו זחט יכל מנס'), true, '<hr> אינו כותרת');
  assert.equal(isDistinctiveLine(null), false);
});

test('A: כותרת קצרה שחוזרת + הזזת שורות — הטעות עדיין בקובץ → לא נסגר', () => {
  const file = L([
    '<h1>ספר בדיקה</h1>', 'הקדמה 1', 'הקדמה 2', 'הקדמה 3', 'הקדמה 4', 'הקדמה 5',
    '<h2>סימן א</h2>', '<h3>סעיף א</h3>', 'טקסט א-א', '<h3>סעיף ב</h3>', 'טקסט א-ב',
    '<h2>סימן ב</h2>', '<h3>סעיף א</h3>', 'טקסט ב-א', '<h3>סעיף ג</h3>', 'טקסט ב-ב',
  ]);
  const args = { lineIndex: 9, original: '<h3>סעיף ג</h3>', proposed: '<h3>סעיף ב</h3>' };
  const s = sourceFor(file, args);
  assert.equal(s.status, 'already_applied', 'במבט על האינדקס בלבד זה נראה מתוקן');
  assert.deepEqual(s.occurrences, { original: 1, proposed: 1 });
  assert.equal(closes(file, args), false);
});

test('A2: כמו A, אבל הטעות שונתה אחרת (סעיף ד) — כותרת קצרה אינה ראיה → לא נסגר', () => {
  const file = L([
    '<h1>ספר בדיקה</h1>', 'הקדמה 1', 'הקדמה 2', 'הקדמה 3', 'הקדמה 4', 'הקדמה 5',
    '<h2>סימן א</h2>', '<h3>סעיף א</h3>', 'טקסט א-א', '<h3>סעיף ב</h3>', 'טקסט א-ב',
    '<h2>סימן ב</h2>', '<h3>סעיף א</h3>', 'טקסט ב-א', '<h3>סעיף ד</h3>', 'טקסט ב-ב',
  ]);
  const args = { lineIndex: 9, original: '<h3>סעיף ג</h3>', proposed: '<h3>סעיף ב</h3>' };
  assert.deepEqual(sourceFor(file, args).occurrences, { original: 0, proposed: 1 });
  assert.equal(closes(file, args), false);
});

test('B: מחיקה (הצעה ריקה) ושורה ריקה שנכנסה לאינדקס — שורת הזבל עדיין בקובץ → לא נסגר', () => {
  const file = L(['<h1>ספר בדיקה</h1>', 'פסקה ראשונה', 'פסקה שנייה', '', 'שורת זבל שצריך למחוק', 'פסקה שלישית']);
  const args = { lineIndex: 3, original: 'שורת זבל שצריך למחוק', proposed: '' };
  assert.equal(sourceFor(file, args).status, 'already_applied');
  assert.equal(closes(file, args), false);
  // גם מחיקה שבוצעה באמת (השורה רוקנה) — ויתור מכוון: לידני
  assert.equal(closes(L(['<h1>ס</h1>', 'פ1', '', 'פ2']), { lineIndex: 2, original: 'שורת זבל', proposed: '' }), false);
});

test('תיקון שהוחל באמת: השורה המקורית אינה בקובץ, והמוצעת ייחודית ומופיעה פעם אחת → נסגר', () => {
  const file = L(['<h1>ספר בדיקה</h1>', 'פסקה ראשונה ארוכה עם תיקון שכבר הוחל', 'פסקה שנייה']);
  const args = { lineIndex: 1, original: 'פסקה ראשונה ארוכה עם טעות', proposed: 'פסקה ראשונה ארוכה עם תיקון שכבר הוחל' };
  assert.equal(closes(file, args), true);
  // אותה שורה מוצעת פעמיים בקובץ (העתקה) → כבר אינה ראיה לתיקון במקום המדווח
  const twice = L(['<h1>ספר בדיקה</h1>', 'פסקה ראשונה ארוכה עם תיקון שכבר הוחל', 'פסקה ראשונה ארוכה עם תיקון שכבר הוחל']);
  assert.equal(closes(twice, args), false);
});

test('BOM ו-CRLF בשורה 0 נסגרים נכון; תווי צורה שונים (שלילי בטוח) ומקור ישן בלי ספירות או בלי איתור — לא', () => {
  assert.equal(closes('﻿פתיחה מתוקנת ארוכה מאוד בשורה הראשונה\r\nשורה\r\n', { lineIndex: 0, original: '﻿פתיחה שגויה ארוכה מאוד בשורה הראשונה', proposed: '﻿פתיחה מתוקנת ארוכה מאוד בשורה הראשונה' }), true);
  // שורה קצרה (3 אסימונים מחוץ לעריכה): בלי שכנים מהבסיס האיתור אינו מזהה אותה — ידני
  const short = sourceFor('﻿כותרת מתוקנת ארוכה מאוד\r\nשורה\r\n', { lineIndex: 0, original: '﻿כותרת שגויה ארוכה מאוד', proposed: '﻿כותרת מתוקנת ארוכה מאוד' });
  assert.deepEqual([short.status, short.located.status, short.located.reason], ['already_applied', 'uncertain', 'short_no_context']);
  assert.equal(isExactlyApplied(short, fullLine('﻿כותרת שגויה ארוכה מאוד', '﻿כותרת מתוקנת ארוכה מאוד')), false);
  // ד+דגש בקובץ מול דּ (U+FB33) בהצעה — השוואה מדויקת, ולכן כלל לא already_applied
  assert.equal(closes(L(['<h1>ס</h1>', 'אחד גדול וארוך מאוד דּ']), { lineIndex: 1, original: 'אחד גדול וארוך מאוד ר', proposed: 'אחד גדול וארוך מאוד דּ' }), false);
  // resolvedSource שנשמר לפני שהספירות נוספו — אין ראיה, לידני
  const rev = fullLine('פסקה ארוכה עם טעות כלשהי', 'פסקה ארוכה עם תיקון כלשהו');
  assert.equal(isExactlyApplied({ status: 'already_applied', currentLine: 'פסקה ארוכה עם תיקון כלשהו' }, rev), false);
  const counted = { status: 'already_applied', lineIndex: 4, currentLine: 'פסקה ארוכה עם תיקון כלשהו', occurrences: { original: 0, proposed: 1 } };
  assert.equal(isExactlyApplied(counted, rev), false, 'בלי איתור (נשמר לפני כלל האיתור) — לידני');
  assert.equal(isExactlyApplied({ ...counted, located: { status: 'fixed', reason: 'fixed', lines: [4, 4] } }, rev), false, 'בלי rawHeld (נשמר לפני תנאי התגיות) — לידני');
  assert.equal(isExactlyApplied({ ...counted, located: { status: 'fixed', reason: 'fixed', lines: [4, 4], rawHeld: true } }, rev), false);
  assert.equal(isExactlyApplied({ ...counted, located: { status: 'fixed', reason: 'fixed', lines: [4, 4], rawHeld: false } }, rev), true);
  assert.equal(isExactlyApplied({ ...counted, located: { status: 'fixed', reason: 'fixed', lines: [6, 7] } }, rev), false, 'מאותר — אבל לא במקום המדווח');
  assert.equal(isExactlyApplied({ ...counted, located: { status: 'uncertain', reason: 'ambiguous', lines: [4, 4] } }, rev), false);
  assert.equal(isExactlyApplied({ ...counted, status: 'exact', located: { status: 'fixed', reason: 'fixed', lines: [4, 4] } }, rev), false);
});

test('ביקורת שלישית: פסקה שזזה וקיבלה מילה (הטעות נשארה), ובאינדקס הישן שורה אחרת זהה להצעה → לא נסגר', () => {
  const bad = 'ובגמרא שם אמר רבי יוחנן הלכא כרבי מאיר בגזירה ובנמצא, ושם מבואר בדברי הראשונים';
  const good = bad.replace('הלכא', 'הלכה');
  const file = L(['<h1>ספר בדיקה</h1>', '', good, 'פסוק שנוסף', bad.replace('מבואר', 'מבואר היטב'), 'סוף']);
  const args = { lineIndex: 2, original: bad, proposed: good };
  const s = sourceFor(file, args);
  assert.deepEqual([s.status, s.occurrences], ['already_applied', { original: 0, proposed: 1 }], 'הכלל המחמיר לבדו היה סוגר');
  assert.deepEqual([s.located.status, s.located.reason, s.located.lines], ['not_fixed', 'original_present', [4, 4]]);
  assert.equal(closes(file, args), false);
  // אותו קובץ כשהפסקה שזזה תוקנה גם היא: שני עותקים מתוקנים זהים כמעט — עמום, לידני
  assert.equal(closes(L(['<h1>ספר בדיקה</h1>', '', good, 'פסוק שנוסף', good.replace('מבואר', 'מבואר היטב'), 'סוף']), args), false);
  // ובלי השורה הזרה — התיקון במקום המדווח נסגר
  assert.equal(closes(L(['<h1>ספר בדיקה</h1>', '', good, 'סוף']), args), true);
});

// הביקורת הרביעית: ההצעה מתקנת מילה וגם מוסיפה תגית. האיתור מנורמל בלי תגיות ולכן רואה כמתוקן גם עותק שבו רק המילה
// תוקנה; כששורה זהה להצעה עומדת במקום המדווח (פיתיון), "כבר הוחל" נסגר בלי שינוי ה-HTML — כמו במפרסם (rawPartHeld).
test('ביקורת רביעית: פסקה שפוצלה וקלטה רק את המילה, ובמקום המדווח שורה זהה להצעה → לא נסגר; קליטה מלאה במקום → נסגר', () => {
  const original = 'כתב הרב הגדול כי הרב השגיאה היא עיקר הענין';
  const proposed = 'כתב הרב הגדול כי <b>הרב</b> השגחה היא עיקר הענין';
  const head = ['הקדמת המחבר', 'פתיחה לענין', 'דברי פתיחה נוספים'];
  const tail = ['ועתה ראו חידוש נפלא', 'דברי סיום', 'סיום הספר'];
  const prev = 'ובספר אחר מבואר שיש לחלק בין המקרים השונים ולכן ראוי לעיין בדבר ועוד';
  const args = { lineIndex: 4, original, proposed };
  // הפסקה המדווחת פוצלה: תחילתה צורפה לשורה הקודמת, והמשכה — המילה תוקנה, התגית לא נוספה. הפיתיון ביניהן.
  const decoy = L([...head, `${prev} הרב הגדול`, proposed, 'כי הרב השגחה היא עיקר הענין', ...tail]);
  const src = sourceFor(decoy, args);
  assert.deepEqual([src.status, src.located.status, src.located.lines, src.occurrences], ['already_applied', 'fixed', [4, 4], { original: 0, proposed: 1 }], 'האיתור המנורמל רואה מתוקן');
  assert.equal(closes(decoy, args), false);
  assert.equal(src.located.rawHeld, true);
  // אותו תיקון שנקלט במלואו במקום — נסגר
  const done = sourceFor(L([...head, prev, proposed, ...tail]), args);
  assert.equal(done.located.rawHeld, false);
  assert.equal(closes(L([...head, prev, proposed, ...tail]), args), true);
});
