/**
 * נוסחי העזרה של הגהת-העמודים (helpTexts.js) — מה שהם מבטיחים למתנדב חייב להיות נכון:
 * שורה נעולה (חיתוך שתוקן) חוזרת אליו רק כשהוא שלח את העמוד בעצמו ("שלח לזיהוי-מחדש" — התפיסה
 * שלו מתחדשת בייבוא); אחרי הגשה ואישור מנהל העמוד חוזר להגהה, לא בהכרח אליו (importRules.RECUT_RESET).
 * הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAQ, RECUT_LINE_TITLE, RECUT_PAGE_TITLE, RECUT_REQUEST_HINT, RECUT_SENT, RECUT_OFF_HELP, RECUT_LINE_TITLE_OFF, BOOK_ONLY_TITLE_OFF, BOOK_ONLY_LINE_TITLE, CERTAINTY_HINT, bookOnlySubmitLine } from './helpTexts.js';

// מתג המנהל כבוי (2026-10-02): רק הדרך של ההגשה — בלי "שלח לזיהוי-מחדש" שאינו מופיע
test('"שלח לזיהוי-מחדש" כבוי: השורה הנעולה והשאלה בעזרה מדברות רק על הגשה', () => {
  assert.doesNotMatch(RECUT_LINE_TITLE_OFF, /שלח לזיהוי-מחדש/);
  assert.match(RECUT_LINE_TITLE_OFF, /אחרי שתגישו את העמוד ומנהל יאשר/);
  assert.equal(RECUT_OFF_HELP.lockedLine, RECUT_LINE_TITLE_OFF);
  const recut = RECUT_OFF_HELP.faq.find((f) => f.key === 'recut');
  assert.doesNotMatch(recut.a, /שלח לזיהוי-מחדש/);
  assert.match(recut.a, /הגישו את העמוד כרגיל/);
  assert.equal(RECUT_OFF_HELP.faq.length, FAQ.length);
});

test('שורה נעולה: שתי הדרכים — "שלח לזיהוי-מחדש" חוזר אליכם; הגשה — חוזרת להגהה, למי שיתפוס אותו', () => {
  assert.match(RECUT_LINE_TITLE, /"שלח לזיהוי-מחדש" — והעמוד יחזור אליכם עם השורות החדשות/);
  assert.match(RECUT_LINE_TITLE, /הגישו את העמוד — ואחרי אישור המנהל הוא יחזור להגהה במעבר שני, למי שיתפוס אותו/);
  // הנוסח הישן הבטיח שהעמוד "יחזור אליכם" גם אחרי הגשה — לא נכון (המגישים והתפיסה מתאפסים)
  assert.doesNotMatch(RECUT_LINE_TITLE, /אחרי אישור המנהל היא תיחתך ותיקרא מחדש בתוכנת-הספר ותחזור אליכם/);
});

test('"ממתין לזיהוי-מחדש": השאלה בעזרה, הכותרת ברשת וההודעות של הבקשה — אותו סיפור', () => {
  const recut = FAQ.find((f) => f.key === 'recut');
  assert.match(recut.a, /"שלח לזיהוי-מחדש" בסרגל — הבקשה ממתינה באתר עד שתוכנת-הספר מעבדת אותה, והעמוד חוזר אליכם/);
  assert.match(recut.a, /או להגיש את העמוד כרגיל/);
  assert.match(RECUT_PAGE_TITLE, /בבקשה של המתנדב שעבד עליו/);
  assert.match(RECUT_PAGE_TITLE, /עמוד שמתנדב שלח חוזר אליו/);
  assert.match(RECUT_REQUEST_HINT, /רק תיקוני-החיתוך נשלחים/);
  assert.match(RECUT_SENT, /יחזור אליכם עם השורות החדשות/);
});

test('שאלות מהפורום (2026-10-01): כותרת-רצה של ההערות — ריהוט', () => {
  const run = FAQ.find((f) => f.key === 'notes-running-head');
  assert.match(run.a, /«כותרת-רצה של ההערות»/);
  assert.match(run.a, /"כותרת הערות" היא כותרת של פרק או סעיף בתוך ההערות, והיא כן נכנסת לספר/);
  assert.equal(new Set(FAQ.map((f) => f.key)).size, FAQ.length);
});

// בעל הפרויקט (2026-10-02): "לספר בלבד" — ולומר במפורש שהמבנה ממשיך ללמד
test('"לספר בלבד": נכנס לספר, לא לאימון — לא המתוקן ולא מה שהמחשב קרא; המבנה כן נלמד', () => {
  const faq = FAQ.find((f) => f.key === 'print-defect');
  assert.match(faq.a, /והדליקו "לספר בלבד" בסרגל: כל שורה שתשנו בה טקסט תסומן מעצמה/);
  assert.match(faq.a, /לא הנוסח המתוקן ולא מה שהמחשב קרא/);
  assert.match(faq.a, /מסגרות, זרמים, סגנונות פסקה ותו, פסקאות וקישורים שתעשו נשמרים כרגיל ומשמשים ללימוד מבנה הדף/);
  // לא סותר את "אות שבורה": שם מקלידים את האות הנכונה בלי סימון
  assert.match(faq.a, /אות שבורה או חלקית שעוד רואים מה היא היא לא "לספר בלבד"/);
  assert.match(BOOK_ONLY_TITLE_OFF, /מסגרות, זרמים, סגנונות, פסקאות וקישורים נשמרים כרגיל/);
  assert.match(BOOK_ONLY_LINE_TITLE, /המבנה והעיצוב של השורה כן נלמדים/);
  // "ודאות" כבר אינו "הלמידה מתעלמת" (לא ברור איזו); מפנה ל"לספר בלבד"
  assert.doesNotMatch(CERTAINTY_HINT, /מתעלמת/);
  assert.match(CERTAINTY_HINT, /לטעות-דפוס יש את "לספר בלבד"/);
  // "לא בטוח" אינו חומר-אימון גם למבנה (בתוכנת-הספר: pool.build(drop_ambiguous=True)) — בניגוד ל"לספר בלבד"
  assert.match(CERTAINTY_HINT, /לא של הזיהוי ולא של מבנה הדף/);
  assert.equal(bookOnlySubmitLine(1), 'שורה אחת מסומנת "לספר בלבד": התיקון ייכנס לספר, והשורה לא תשמש לאימון.');
  assert.match(bookOnlySubmitLine(3), /^3 שורות מסומנות "לספר בלבד".*והשורות לא ישמשו לאימון\.$/);
});
