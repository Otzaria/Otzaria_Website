import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestEmailDomain, editDistance } from './emailTypo.js';

test('editDistance: החלפה, השמטה והחלפת סמוכים', () => {
  assert.equal(editDistance('gmail.cim', 'gmail.com'), 1);
  assert.equal(editDistance('gmial.com', 'gmail.com'), 1);
  assert.equal(editDistance('gmail.com', 'gmail.com'), 0);
});

test('suggestEmailDomain: שגיאות הקלדה נפוצות', () => {
  for (const [email, expected] of [
    ['t0x@gmail.cim', 'gmail.com'], ['a@gmial.com', 'gmail.com'], ['a@gmail.con', 'gmail.com'],
    ['a@gmai.com', 'gmail.com'], ['a@GMAIL.CIM', 'gmail.com'], ['a@hotmial.com', 'hotmail.com'],
    ['a@wala.co.il', 'walla.co.il'], ['a@outlok.com', 'outlook.com'], ['a@gmail.co', 'gmail.com'],
  ]) assert.equal(suggestEmailDomain(email), expected, email);
});

test('suggestEmailDomain: דומיין תקין או לא מוכר — בלי הצעה', () => {
  for (const email of ['a@gmail.com', 'a@mail.com', 'a@ymail.com', 'a@email.com', 'a@example.org', 'a@otzaria.org', 'a@x.org', 'no-at', '', null]) {
    assert.equal(suggestEmailDomain(email), null, String(email));
  }
});
