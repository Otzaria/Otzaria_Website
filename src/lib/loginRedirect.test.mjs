import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_LOGIN_REDIRECT,
  getSafeCallbackUrl,
  loginErrorMessage,
  firstSearchParam,
} from './loginRedirect.js';

test('getSafeCallbackUrl: נתיב פנימי רגיל עובר כמו שהוא, כולל query ו-hash', () => {
  assert.equal(getSafeCallbackUrl('/plugins/abc'), '/plugins/abc');
  assert.equal(getSafeCallbackUrl('/library/books?x=1#top'), '/library/books?x=1#top');
});

test('getSafeCallbackUrl: ערך חסר או ריק → ברירת המחדל', () => {
  assert.equal(getSafeCallbackUrl(null), DEFAULT_LOGIN_REDIRECT);
  assert.equal(getSafeCallbackUrl(undefined), DEFAULT_LOGIN_REDIRECT);
  assert.equal(getSafeCallbackUrl(''), DEFAULT_LOGIN_REDIRECT);
});

test('getSafeCallbackUrl: open-redirect לדומיין חיצוני נחסם', () => {
  assert.equal(getSafeCallbackUrl('https://evil.com'), DEFAULT_LOGIN_REDIRECT);
  assert.equal(getSafeCallbackUrl('//evil.com'), DEFAULT_LOGIN_REDIRECT);
  assert.equal(getSafeCallbackUrl('/\\evil.com'), DEFAULT_LOGIN_REDIRECT);
  assert.equal(getSafeCallbackUrl('javascript:alert(1)'), DEFAULT_LOGIN_REDIRECT);
});

test('getSafeCallbackUrl: חזרה לדף ההתחברות עצמו (לופ) → ברירת המחדל', () => {
  assert.equal(getSafeCallbackUrl('/auth/login'), DEFAULT_LOGIN_REDIRECT);
  assert.equal(getSafeCallbackUrl('/auth/login?callbackUrl=/x'), DEFAULT_LOGIN_REDIRECT);
  assert.equal(getSafeCallbackUrl('/auth/login/extra'), DEFAULT_LOGIN_REDIRECT);
  // נתיב שרק מתחיל באותן אותיות אינו דף ההתחברות
  assert.equal(getSafeCallbackUrl('/auth/loginx'), '/auth/loginx');
});

test('loginErrorMessage: הודעה בעברית לשגיאות המוכרות בלבד', () => {
  assert.match(loginErrorMessage('InvalidToken'), /אינו תקין/);
  assert.match(loginErrorMessage('TokenExpired'), /פג תוקף/);
  assert.match(loginErrorMessage('ServerError'), /שגיאה/);
  assert.equal(loginErrorMessage('Other'), '');
  assert.equal(loginErrorMessage(null), '');
  assert.equal(loginErrorMessage('constructor'), '');
});

test('firstSearchParam: כמו URLSearchParams.get', () => {
  assert.equal(firstSearchParam('a'), 'a');
  assert.equal(firstSearchParam(['a', 'b']), 'a');
  assert.equal(firstSearchParam([]), null);
  assert.equal(firstSearchParam(undefined), null);
  assert.equal(firstSearchParam(''), '');
});
