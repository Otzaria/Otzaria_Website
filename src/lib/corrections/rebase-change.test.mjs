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
