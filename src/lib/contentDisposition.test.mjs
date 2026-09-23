import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentDisposition } from './contentDisposition.js';

test('attachmentDisposition — שם ASCII נשמר כמו שהוא בשני השדות', () => {
  assert.equal(
    attachmentDisposition('setup.exe'),
    `attachment; filename="setup.exe"; filename*=UTF-8''setup.exe`
  );
});

test('attachmentDisposition — עברית מוחלפת בגיבוי ומקודדת ב-filename*', () => {
  const header = attachmentDisposition('חברותא.otzplugin');
  assert.match(header, /filename="_+\.otzplugin"/);
  assert.match(header, /filename\*=UTF-8''%D7%97%D7%91%D7%A8%D7%95%D7%AA%D7%90\.otzplugin$/);
});

test('attachmentDisposition — גרשיים, לוכסן הפוך ושבירת שורה אינם שוברים את הכותרת', () => {
  const header = attachmentDisposition('a"b\\c\r\nd.exe');
  assert.match(header, /^attachment; filename="a_b_c__d\.exe";/);
  assert.ok(!/[\r\n]/.test(header));
});

test("attachmentDisposition — ! ' ( ) * מקודדים ב-filename*", () => {
  assert.match(attachmentDisposition("x(1)!'*.exe"), /filename\*=UTF-8''x%281%29%21%27%2A\.exe$/);
});
