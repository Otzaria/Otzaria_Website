import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorText } from './error-text.js';

test('הודעות שגיאה: עברית לקוד מוכר, מספר השורות ב-line_out_of_range, והקוד/ברירת מחדל אחרת', () => {
  assert.equal(errorText({ error: 'file_not_found' }), 'הקובץ לא נמצא במאגר — בדקו את שם הספר והנתיב.');
  assert.equal(errorText({ error: 'line_out_of_range', lineCount: 120 }), 'מספר השורה גדול ממספר השורות בקובץ (120).');
  assert.equal(errorText({ error: 'line_out_of_range' }), 'מספר השורה גדול ממספר השורות בקובץ.');
  assert.equal(errorText({ error: 'weird_code' }), 'weird_code');
  assert.equal(errorText(null, 'שגיאה בטעינה'), 'שגיאה בטעינה');
});
