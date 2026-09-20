import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  suggestUsernameBase,
  pickAvailableUsername,
  validateUsername,
  USERNAME_MAX_LENGTH,
} from './googleSignup.js';

test('suggestUsernameBase: משתמש בשם מ-Google', () => {
  assert.equal(suggestUsernameBase('ישראל כהן', 'israel@x.com'), 'ישראל כהן');
});

test('suggestUsernameBase: מנקה תווים מיוחדים ורווחים כפולים', () => {
  assert.equal(suggestUsernameBase('  יוסי   <כהן>!! ', 'a@x.com'), 'יוסי כהן');
});

test('suggestUsernameBase: נופל לחלק שלפני ה-@ כשהשם קצר מדי', () => {
  assert.equal(suggestUsernameBase('', 'moshe.cohen@x.com'), 'moshe.cohen');
  assert.equal(suggestUsernameBase('א', 'moshe@x.com'), 'moshe');
});

test('suggestUsernameBase: ברירת מחדל כשאין כלום שמיש', () => {
  assert.equal(suggestUsernameBase('', '@x.com'), 'משתמש');
  assert.equal(suggestUsernameBase(null, null), 'משתמש');
});

test('suggestUsernameBase: חותך לאורך המרבי', () => {
  const long = 'א'.repeat(80);
  assert.equal(suggestUsernameBase(long, 'a@x.com').length, USERNAME_MAX_LENGTH);
});

test('pickAvailableUsername: מחזיר את הבסיס כשהוא פנוי', () => {
  assert.equal(pickAvailableUsername('יוסי', ['משה']), 'יוסי');
});

test('pickAvailableUsername: מוסיף מספר כשתפוס, גם ברישיות שונה', () => {
  assert.equal(pickAvailableUsername('Yossi', ['yossi']), 'Yossi2');
  assert.equal(pickAvailableUsername('יוסי', ['יוסי', 'יוסי2']), 'יוסי3');
});

test('pickAvailableUsername: לא חורג מהאורך המרבי', () => {
  const base = 'א'.repeat(USERNAME_MAX_LENGTH);
  const picked = pickAvailableUsername(base, [base]);
  assert.ok(picked.length <= USERNAME_MAX_LENGTH);
  assert.ok(picked.endsWith('2'));
});

test('validateUsername', () => {
  assert.equal(validateUsername('יוסי'), null);
  assert.equal(validateUsername('  יוסי  '), null);
  assert.ok(validateUsername('א'));
  assert.ok(validateUsername(' '));
  assert.ok(validateUsername('א'.repeat(51)));
});
