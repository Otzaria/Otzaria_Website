/**
 * נוסחי העזרה של הגהת-העמודים (helpTexts.js) — מה שהם מבטיחים למתנדב חייב להיות נכון:
 * שורה נעולה (חיתוך שתוקן) חוזרת אליו רק כשהוא שלח את העמוד בעצמו ("שלח לזיהוי-מחדש" — התפיסה
 * שלו מתחדשת בייבוא); אחרי הגשה ואישור מנהל העמוד חוזר להגהה, לא בהכרח אליו (importRules.RECUT_RESET).
 * הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAQ,
  RECUT_LINE_TITLE,
  RECUT_PAGE_TITLE,
  RECUT_REQUEST_HINT,
  RECUT_SENT,
  RECUT_OFF_HELP,
  RECUT_LINE_TITLE_OFF,
  BOOK_ONLY_NAME,
  BOOK_ONLY_TITLE_OFF,
  BOOK_ONLY_TITLE_ON,
  BOOK_ONLY_STATUS,
  BOOK_ONLY_LINE,
  BOOK_ONLY_LINE_TITLE,
  BOOK_ONLY_HINTS,
  CERTAINTY_HINT,
  bookOnlyCount,
  bookOnlySubmitLine,
} from './helpTexts.js';

// מתג המנהל כבוי (2026-10-02): רק הדרך של ההגשה — בלי "שלח לזיהוי-מחדש" שאינו מופיע
test('"שלח לזיהוי-מחדש" כבוי: השורה הנעולה והשאלה בעזרה מדברות רק על הגשה', () => {
  assert.doesNotMatch(RECUT_LINE_TITLE_OFF, /שלח לזיהוי-מחדש/);
  assert.match(RECUT_LINE_TITLE_OFF, /אחרי שתגישו את העמוד ומנהל יאשר/);
  assert.equal(RECUT_OFF_HELP.lockedLine, RECUT_LINE_TITLE_OFF);
  // כבוי — העמוד ממתין לאישור מנהל, נעול (בעל הפרויקט, 2026-10-06): אותה תשובה כמו כשפועל
  const recut = RECUT_OFF_HELP.faq.find((f) => f.key === 'recut');
  assert.doesNotMatch(recut.a, /שלח לזיהוי-מחדש/);
  assert.match(recut.a, /לאישור זיהוי-מחדש/);
  assert.match(recut.a, /נעול/);
  assert.equal(RECUT_OFF_HELP.faq.length, FAQ.length);
});

test('שורה נעולה (בשלב הטקסט — רק אחרי שהמנהל לא אישר זיהוי-מחדש): הגשה — חוזרת להגהה, למי שיתפוס אותו', () => {
  assert.doesNotMatch(RECUT_LINE_TITLE, /שלח לזיהוי-מחדש/);
  assert.match(RECUT_LINE_TITLE, /הגישו את העמוד — ואחרי אישור המנהל הוא יחזור להגהה במעבר שני, למי שיתפוס אותו/);
  // הנוסח הישן הבטיח שהעמוד "יחזור אליכם" גם אחרי הגשה — לא נכון (המגישים והתפיסה מתאפסים)
  assert.doesNotMatch(RECUT_LINE_TITLE, /אחרי אישור המנהל היא תיחתך ותיקרא מחדש בתוכנת-הספר ותחזור אליכם/);
});

test('"ממתין לזיהוי-מחדש": השאלה בעזרה, הכותרת ברשת וההודעות של הבקשה — אותו סיפור', () => {
  const recut = FAQ.find((f) => f.key === 'recut');
  assert.match(recut.a, /"✓ המבנה נכון — לזיהוי-מחדש": העמוד נשלח, נעול עד שיזוהה מחדש, וחוזר אליכם לשלב הטקסט/);
  assert.match(recut.a, /"✓ המבנה נכון — לאישור זיהוי-מחדש": העמוד ממתין לאישור מנהל/);
  assert.match(recut.a, /עמוד שממתין אינו נספר בעמודים שאתם מחזיקים/);
  assert.match(RECUT_PAGE_TITLE, /בבקשה של המתנדב שעבד עליו/);
  assert.match(RECUT_PAGE_TITLE, /עמוד שמתנדב שלח חוזר אליו/);
  assert.match(RECUT_REQUEST_HINT, /רק תיקוני-החיתוך נשלחים/);
  assert.match(RECUT_SENT, /יחזור אליכם עם השורות החדשות/);
});

test('שאלות מהפורום (2026-10-01): כותרת-רצה של ההערות — ריהוט', () => {
  const run = FAQ.find((f) => f.key === 'notes-running-head');
  assert.match(run.a, /«כותרת-רצה של ההערות»/);
  assert.match(run.a, /כותרת של פרק או סעיף בתוך ההערות כן נכנסת לספר — היא חלק מהטקסט: סגנון-הפסקה "כותרת", לא מסגרת/);
  // בעל הפרויקט (2026-10-05): כותרת — סגנון-פסקה, לא מסגרת
  const head = FAQ.find((f) => f.key === 'headings');
  assert.match(head.a, /לא ריהוט ולא מסגרת נפרדת/);
  assert.doesNotMatch(head.a, /מסגרת בזרם הכותרת/);
  assert.equal(new Set(FAQ.map((f) => f.key)).size, FAQ.length);
});

// בעל הפרויקט (2026-10-02): "לספר בלבד" — ולומר במפורש שהמבנה ממשיך ללמד. השם שהמתנדב רואה — "פגם בדפוס" (2026-10-05)
test('"פגם בדפוס": נכנס לספר, לא לאימון — לא המתוקן ולא מה שהמחשב קרא; המבנה כן נלמד', () => {
  const faq = FAQ.find((f) => f.key === 'print-defect');
  assert.match(faq.a, /והדליקו "פגם בדפוס" בסרגל: כל שורה שתשנו בה טקסט תסומן מעצמה/);
  assert.match(faq.a, /לא הנוסח המתוקן ולא מה שהמחשב קרא/);
  assert.match(faq.a, /מסגרות, זרמים, סגנונות פסקה ותו, פסקאות וקישורים שתעשו נשמרים כרגיל ומשמשים ללימוד מבנה הדף/);
  // לא סותר את "אות שבורה": שם מקלידים את האות הנכונה בלי סימון
  assert.match(faq.a, /אות שבורה או חלקית שעוד רואים מה היא היא לא "פגם בדפוס"/);
  assert.match(BOOK_ONLY_TITLE_OFF, /מסגרות, זרמים, סגנונות, פסקאות וקישורים נשמרים כרגיל/);
  // הכפתור הוא מצב — וההסבר אומר את זה
  assert.match(BOOK_ONLY_TITLE_OFF, /כשהמצב דולק, כל תיקון-טקסט נכנס לספר, אבל השורה לא משמשת לאימון המחשב/);
  assert.match(BOOK_ONLY_TITLE_ON, /כל תיקון-טקסט נכנס לספר, אבל השורה לא משמשת לאימון המחשב/);
  assert.equal(BOOK_ONLY_NAME, 'פגם בדפוס');
  assert.equal(BOOK_ONLY_LINE, 'פגם בדפוס (לא לאימון)');
  // שום נוסח שהמתנדב רואה אינו "לספר בלבד" עוד
  for (const t of [faq.a, BOOK_ONLY_TITLE_OFF, BOOK_ONLY_TITLE_ON, BOOK_ONLY_STATUS, BOOK_ONLY_LINE, BOOK_ONLY_LINE_TITLE, CERTAINTY_HINT, ...Object.values(BOOK_ONLY_HINTS)]) {
    assert.doesNotMatch(t, /לספר בלבד/);
  }
  assert.match(BOOK_ONLY_LINE_TITLE, /המבנה והעיצוב של השורה כן נלמדים/);
  // "ודאות" כבר אינו "הלמידה מתעלמת" (לא ברור איזו); מפנה ל"פגם בדפוס"
  assert.doesNotMatch(CERTAINTY_HINT, /מתעלמת/);
  assert.match(CERTAINTY_HINT, /לטעות-דפוס יש את "פגם בדפוס"/);
  // "לא בטוח" אינו חומר-אימון גם למבנה (בתוכנת-הספר: pool.build(drop_ambiguous=True)) — בניגוד ל"לספר בלבד"
  assert.match(CERTAINTY_HINT, /לא של הזיהוי ולא של מבנה הדף/);
  assert.equal(bookOnlySubmitLine(1), 'שורה אחת עם פגם בדפוס: התיקון ייכנס לספר, והשורה לא תשמש לאימון.');
  assert.equal(bookOnlySubmitLine(3), '3 שורות עם פגם בדפוס: התיקון ייכנס לספר, והשורות לא ישמשו לאימון.');
  assert.equal(bookOnlyCount(1), 'שורה אחת עם פגם בדפוס');
  assert.equal(bookOnlyCount(1200), '1,200 שורות עם פגם בדפוס');
});
