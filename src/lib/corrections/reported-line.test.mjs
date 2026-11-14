import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportedLinePick } from './reported-line.js';

const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/ספר.txt';

test('שורה שלא אותרה בוודאות, בקובץ שאותר: השורה שדווחה', () => {
  assert.deepEqual(reportedLinePick({ report: { location: { lineIndex: 41 } }, source: { path: PATH }, located: false }), { path: PATH, lineIndex: 41 });
  assert.deepEqual(reportedLinePick({ report: { location: { lineIndex: 0 } }, source: { path: PATH }, located: false }), { path: PATH, lineIndex: 0 });
});

test('אין הצעה כשהשורה אותרה, כשהקובץ לא אותר, או בלי מספר שורה תקין', () => {
  assert.equal(reportedLinePick({ report: { location: { lineIndex: 41 } }, source: { path: PATH }, located: true }), null);
  assert.equal(reportedLinePick({ report: { location: { lineIndex: 41 } }, source: { path: null }, located: false }), null);
  assert.equal(reportedLinePick({ report: { location: { lineIndex: 41 } }, source: null, located: false }), null);
  assert.equal(reportedLinePick({ report: { location: null }, source: { path: PATH }, located: false }), null);
  assert.equal(reportedLinePick({ report: { location: { lineIndex: -1 } }, source: { path: PATH }, located: false }), null);
  assert.equal(reportedLinePick({ report: { location: { lineIndex: 2.5 } }, source: { path: PATH }, located: false }), null);
});
