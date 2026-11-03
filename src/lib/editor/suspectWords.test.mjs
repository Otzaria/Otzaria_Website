import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOW_CONF, shapeReasons, suspectWords, alternativeIndexes } from './suspectWords.js';

test('shapeReasons: מילים תקינות — אין חשד', () => {
  for (const w of ['בראשית', 'שלום', 'כל־העם', 'ר"ת', `תוס'`, 'בְּרֵאשִׁית:', '(אמן)', 'abc', '123', '—', ''])
    assert.deepEqual(shapeReasons(w), [], w);
});

test('shapeReasons: אות לטינית / ספרה בתוך מילה עברית', () => {
  assert.ok(shapeReasons('שלlם').includes('mixed_script'));
  assert.ok(shapeReasons('ב3ית').includes('digit_in_word'));
});

test('shapeReasons: אות סופית באמצע, רגילה בסוף', () => {
  assert.ok(shapeReasons('שםלום').includes('final_mid'));
  assert.ok(shapeReasons('שלומ').includes('non_final_end'));
  // מקף: כל חלק לעצמו
  assert.deepEqual(shapeReasons('אם־כן'), []);
  assert.ok(shapeReasons('אמ־כן').includes('non_final_end'));
  // ראשי תיבות עם גרשיים — בלי חשד סופיות
  assert.deepEqual(shapeReasons('ס"מ'), []);
});

test('shapeReasons: אות משולשת, פיסוק בין אותיות, ניקוד לא מפריע', () => {
  assert.ok(shapeReasons('אממממר').includes('repeated_char'));
  assert.ok(shapeReasons('בר.א').includes('inner_punct'));
  assert.ok(shapeReasons('שְׁםלוֹם').includes('final_mid'));
});

test('suspectWords: ביטחון נמוך (0..1 ו-0..100), חלופות, היסטים', () => {
  const s = suspectWords('בראשית ברא אלהים', { confs: [0.99, 0.5, 0.9] });
  assert.deepEqual(s, [{ index: 1, start: 7, end: 10, text: 'ברא', reasons: ['low_conf'] }]);
  assert.deepEqual(suspectWords('אב גד', { confs: [99, 40] }).map((x) => x.index), [1]);
  assert.deepEqual(suspectWords('אב גד', { alternatives: [0] })[0].reasons, ['alternatives']);
  assert.deepEqual(suspectWords('אב גד', { confs: [0.85, 0.85], threshold: 0.9 }).length, 2);
  assert.equal(LOW_CONF, 0.8);
});

test('suspectWords: כללי צורה ו-shapes=false', () => {
  const s = suspectWords('שלום שלlם');
  assert.equal(s.length, 1);
  assert.equal(s[0].index, 1);
  assert.deepEqual(suspectWords('שלlם', { shapes: false }), []);
});

test('suspectWords: ריק, null, confs חלקי', () => {
  assert.deepEqual(suspectWords(''), []);
  assert.deepEqual(suspectWords(null), []);
  assert.deepEqual(suspectWords('אב גד', { confs: [null] }), []);
});

test('alternativeIndexes: layout v1 ו-PageProof', () => {
  assert.deepEqual(alternativeIndexes({ alternatives: [{ i: 2 }], lm: [{ i: 0 }, { i: 2 }] }), [0, 2]);
  assert.deepEqual(alternativeIndexes({ lm_flags: [{ i: 3 }], flags: { low_words: [1, 'x'] } }), [1, 3]);
  assert.deepEqual(alternativeIndexes(null), []);
});
