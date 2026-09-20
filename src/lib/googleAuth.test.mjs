import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GOOGLE_AUTH_ERRORS,
  isGoogleAuthConfigured,
  normalizeEmail,
  isGoogleProfileVerified,
  buildEmailLookupQuery,
  pickUserForEmail,
  toTokenUserFields,
} from './googleAuth.js';

test('isGoogleAuthConfigured: דורש את שני הסודות', () => {
  assert.equal(isGoogleAuthConfigured({}), false);
  assert.equal(isGoogleAuthConfigured({ GOOGLE_CLIENT_ID: 'a' }), false);
  assert.equal(isGoogleAuthConfigured({ GOOGLE_CLIENT_SECRET: 'b' }), false);
  assert.equal(isGoogleAuthConfigured({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }), true);
});

test('normalizeEmail: חיתוך רווחים ואותיות קטנות', () => {
  assert.equal(normalizeEmail('  Yosef@Gmail.COM '), 'yosef@gmail.com');
  assert.equal(normalizeEmail(undefined), '');
});

test('isGoogleProfileVerified', () => {
  assert.equal(isGoogleProfileVerified({ email_verified: true }), true);
  assert.equal(isGoogleProfileVerified({ email_verified: 'true' }), true);
  assert.equal(isGoogleProfileVerified({ email_verified: false }), false);
  assert.equal(isGoogleProfileVerified({}), false);
  assert.equal(isGoogleProfileVerified(null), false);
});

test('buildEmailLookupQuery: לא תלוי רישיות ומעגן את כל המחרוזת', () => {
  const { email: re } = buildEmailLookupQuery('yosef@gmail.com');
  assert.ok(re.test('Yosef@Gmail.com'));
  assert.ok(!re.test('xyosef@gmail.com'));
  assert.ok(!re.test('yosef@gmail.com.evil'));
});

test('buildEmailLookupQuery: תווים מיוחדים מוברחים', () => {
  const { email: re } = buildEmailLookupQuery('a.b+c@x.com');
  assert.ok(re.test('a.b+c@x.com'));
  assert.ok(!re.test('aXb+c@x.com'));
  assert.ok(!re.test('a.bbc@x.com'));
});

test('pickUserForEmail: אין מועמדים', () => {
  assert.deepEqual(pickUserForEmail([], 'a@x.com'), { user: null, error: GOOGLE_AUTH_ERRORS.NO_ACCOUNT });
});

test('pickUserForEmail: מועמד יחיד גם ברישיות שונה', () => {
  const u = { email: 'A@X.com' };
  assert.deepEqual(pickUserForEmail([u], 'a@x.com'), { user: u, error: null });
});

test('pickUserForEmail: כמה מועמדים — מעדיף התאמה מדויקת, אחרת ambiguous', () => {
  const a = { email: 'A@x.com' };
  const b = { email: 'a@x.com' };
  assert.deepEqual(pickUserForEmail([a, b], 'a@x.com'), { user: b, error: null });
  assert.deepEqual(pickUserForEmail([a, { email: 'A@X.com' }], 'a@x.com'), {
    user: null,
    error: GOOGLE_AUTH_ERRORS.AMBIGUOUS,
  });
});

test('toTokenUserFields: חשבון Google מסומן כחסר סיסמה', () => {
  const fields = toTokenUserFields({ _id: { toString: () => 'g1' }, email: 'g@x.com', name: 'גוגל' });
  assert.equal(fields.hasPassword, false);
});

test('toTokenUserFields: ממיר מזהה למחרוזת ומנרמל דגלים', () => {
  const fields = toTokenUserFields({
    _id: { toString: () => 'abc' },
    email: 'a@x.com',
    name: 'יוסף',
    role: 'user',
    acceptReminders: true,
    isVerified: false,
    password: '$2a$12$hash',
  });
  assert.deepEqual(fields, {
    id: 'abc',
    email: 'a@x.com',
    name: 'יוסף',
    role: 'user',
    acceptReminders: true,
    isVerified: false,
    hasPassword: true,
    isSupervisor: false,
    isCorrectionsVolunteer: false,
  });
});
