import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { lineAlignmentFor } from './caretTrack.js';
import { alignLines, lineCost, normalizeLine } from './lineAlign.js';

const page = (n) => Array.from({ length: n }, (_, i) => ({
  text: `אמר רבי יהודה אמר רב דברי תורה וחכמים מצוות ישראל ודברי שלום ${i}`,
  bbox: [10, i * 25, 700, i * 25 + 20], stream: 'main', words: []
}));

// זמני קיר מוחלטים נכשלים כשהמכונה עמוסה (הרצה מלאה במקביל, CI): אותו קוד לקח פעם 50ms
// ופעם 500ms. לכן כל בדיקה משווה את הקוד הנבדק לקוד ייחוס שרץ לסירוגין איתו, באותו תהליך
// ובאותו עומס, ומודדת יחס: עומס מאט את שניהם יחד, ואילו נסיגה אלגוריתמית משנה את היחס עצמו
// פי כמה. חציון היחסים של כמה זוגות מבטל קפיצה בודדת (GC, החלפת הקשר) באחד מהם.
const elapsed = (fn) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};
function medianRatio(rounds, measured, reference) {
  measured(0);
  reference(0); // חימום (JIT) — לא נספר
  const ratios = [];
  for (let r = 1; r <= rounds; r++) ratios.push(elapsed(() => measured(r)) / elapsed(() => reference(r)));
  return ratios.sort((a, b) => a - b)[Math.floor(rounds / 2)];
}

test('הקלדת תווים בעמוד בן 200 שורות אינה מריצה מחדש יישור ריבועי יקר', () => {
  const scan = page(200);
  const text = scan.map((l) => l.text).join('\n');
  const lines = text.split('\n');
  lineAlignmentFor(text, scan);
  // ייחוס: יישור DP מלא (force) של אותו עמוד אחרי אותה עריכה — מה שעריכה הריצה לפני התיקון.
  // היום עריכה עוצרת בבדיקת הזהות (לינארית), כפי 20 מהר מה-DP; נסיגה מחזירה יחס של כ-1 ומעלה.
  const ratio = medianRatio(5,
    // כל פעם טקסט חדש: המטמון של היישור הקודם אינו יכול להסתיר את עלות העריכה.
    (r) => {
      const al = lineAlignmentFor(text + 'א'.repeat(r + 1), scan);
      assert.deepEqual(al.map((a) => a.scanIndex), scan.map((_, j) => j));
    },
    (r) => alignLines([...lines.slice(0, -1), lines.at(-1) + 'א'.repeat(r + 1)], scan, { force: true }));
  assert.ok(ratio < 0.25, `עריכה מול DP מלא: יחס ${ratio.toFixed(3)}`);
});

test('גם עם שגיאות OCR בכל שורה, ה-DP משתמש בנתוני השוואה מוכנים מראש', () => {
  const scan = page(200);
  const text = scan.map((l) => l.text.replace('רבי', 'רכה').replace('שלום', 'סלום'));
  const A = text.map(normalizeLine);
  // רבע מעמודות המטריצה מספיק לייחוס, ומקצר את הבדיקה
  const B = scan.slice(0, 50).map((l) => normalizeLine(l.text));
  let sink = 0;
  // ייחוס: lineCost (בונה זוגות-אותיות מחדש בכל קריאה) פעם אחת לכל תא ברבע מהמטריצה. ה-DP לפני
  // התיקון חישב כך כ-3 השוואות לכל תא (התאמה, איחוד, פיצול) בכל המטריצה — יחס של כ-12; היום
  // היחס כ-1.7 (נמדד בכמה הרצות מקומיות: 1.6-1.9). הסף 4 הוא מרווח של פי 2 מעל היום ופי 3
  // מתחת לנסיגה — בכוונה לא הדוק יותר, כדי שלא יהיה גחמני ב-CI איטי.
  const ratio = medianRatio(3,
    () => {
      const al = alignLines(text, scan);
      assert.deepEqual(al.map((a) => a.scanIndex), scan.map((_, i) => i));
    },
    () => {
      for (const a of A) for (const b of B) sink += lineCost(a, b);
    });
  assert.ok(sink > 0);
  assert.ok(ratio < 4, `יישור עם שגיאות OCR מול השוואה לא-מוכנה לכל תא: יחס ${ratio.toFixed(3)}`);
});
