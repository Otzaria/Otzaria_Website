import test from 'node:test';
import assert from 'node:assert/strict';
import { rebaseLineChange } from './rebase-change.js';

test('שורה לא השתנתה בגיטהאב: מחזיר את ההצעה כמו שהיא', () => {
  const r = rebaseLineChange('יום שלישי הוא', 'יום שני הוא', 'יום שלישי הוא');
  assert.equal(r.line, 'יום שני הוא');
});

test('תיקון אחד בלבד מוחל; תיקונים אחרים שכבר נעשו בגיטהאב נשמרים', () => {
  const original = 'אמר שלישי בעניין זה והוא קיים אותו דבר שגוי';
  const reported = 'אמר שני בעניין זה והוא קיים אותו דבר שגוי';
  const current = 'אמר שלישי בעניין זה והוא קיים אותו דבר נכון'; // תוקן בגיטהאב: שגוי → נכון
  const r = rebaseLineChange(original, reported, current);
  assert.equal(r.line, 'אמר שני בעניין זה והוא קיים אותו דבר נכון');
  assert.equal(r.applied, 1);
  assert.equal(r.conflicts, 0);
});

test('כבר מתוקן בגיטהאב: נספר כ-skipped ולא משתנה', () => {
  const r = rebaseLineChange('א שלישי ב ישן', 'א שני ב ישן', 'א שני ב חדש');
  assert.equal(r.line, 'א שני ב חדש');
  assert.equal(r.skipped, 1);
});

test('הוספת מילה', () => {
  const r = rebaseLineChange('א ב ג', 'א ב ד ג', 'א ב ג ה');
  assert.equal(r.line, 'א ב ד ג ה');
});

test('התנגשות: אותה מילה שונתה אחרת בגיטהאב — נשארת כמו בגיטהאב ומדווחת', () => {
  const r = rebaseLineChange('א ב ג', 'א X ג', 'א Y ג');
  assert.equal(r.line, 'א Y ג');
  assert.equal(r.conflicts, 1);
});

test('כמה תיקונים באותה שורה, חלקם מוחלים וחלקם כבר בוצעו', () => {
  const r = rebaseLineChange('a1 b1 c1 d1', 'a2 b2 c1 d2', 'a1 b2 c1 d1');
  assert.equal(r.line, 'a2 b2 c1 d2');
  assert.equal(r.applied, 2);
});

test('טקסט חלופי שמופיע במקום אחר בשורה אינו מסומן בטעות ככבר תוקן', () => {
  const r = rebaseLineChange('תחילה שגוי ולבסוף נכון', 'תחילה נכון ולבסוף נכון', 'תחילה אחר ולבסוף נכון');
  assert.equal(r.line, 'תחילה אחר ולבסוף נכון');
  assert.equal(r.skipped, 0);
  assert.equal(r.conflicts, 1);
});

test('שורה בעלת diff גדול מדי חוזרת בבטחה למיזוג ידני', () => {
  const original = Array.from({ length: 1100 }, (_, i) => `א${i}`).join(' ');
  const proposed = Array.from({ length: 1100 }, (_, i) => `ב${i}`).join(' ');
  const current = Array.from({ length: 1100 }, (_, i) => `ג${i}`).join(' ');
  const r = rebaseLineChange(original, proposed, current);
  assert.equal(r.line, current);
  assert.equal(r.clean, false);
});
