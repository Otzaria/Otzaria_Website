import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consensus, normalizeText, answerKey } from './consensus.js';

const a = (user, verdict, text = null) => ({ user, verdict, text });

test('normalizeText: ניקוד, גרשיים, מירכאות ורווחים', () => {
  assert.equal(normalizeText('  בְּרֵאשִׁית   בָּרָא '), 'בראשית ברא');
  assert.equal(normalizeText('רש״י'), 'רש"י');
  assert.equal(normalizeText('רש“י'), 'רש"י');
  assert.equal(normalizeText('גמ׳'), "גמ'");
  assert.equal(normalizeText('גמ’'), "גמ'");
  // מקף עברי אינו ניקוד — נשאר
  assert.equal(normalizeText('כל־זמן'), 'כל־זמן');
});

test('answerKey: other כולל טקסט מנורמל', () => {
  assert.equal(answerKey(a('1', 'print')), 'print');
  assert.equal(answerKey(a('1', 'other', 'א״ר')), answerKey(a('2', 'other', ' א"ר ')));
});

test('תשובה אחת — פתוח', () => {
  assert.equal(consensus([a('1', 'print')]).status, 'open');
  assert.equal(consensus([]).status, 'open');
});

test('שתי תשובות זהות — agreed, עם המסכימים', () => {
  const c = consensus([a('1', 'print'), a('2', 'print')]);
  assert.deepEqual(c, { status: 'agreed', verdict: 'print', text: null, agreers: ['1', '2'] });
});

test('other עם אותו טקסט אחרי נרמול — agreed', () => {
  const c = consensus([a('1', 'other', 'אמר רבי'), a('2', 'other', 'אָמַר  רַבִּי')]);
  assert.equal(c.status, 'agreed');
  assert.equal(c.verdict, 'other');
  assert.equal(c.text, 'אמר רבי');
});

test('other עם טקסט שונה — disputed', () => {
  assert.equal(consensus([a('1', 'other', 'א'), a('2', 'other', 'ב')]).status, 'disputed');
});

test('שתי תשובות שונות — disputed', () => {
  assert.equal(consensus([a('1', 'print'), a('2', 'otz')]).status, 'disputed');
});

test('unclear אחד לא סוגר; שניים — disputed', () => {
  assert.equal(consensus([a('1', 'unclear')]).status, 'open');
  assert.equal(consensus([a('1', 'unclear'), a('2', 'print')]).status, 'open');
  assert.equal(consensus([a('1', 'unclear'), a('2', 'unclear')]).status, 'disputed');
  const c = consensus([a('1', 'unclear'), a('2', 'print'), a('3', 'print')]);
  assert.equal(c.status, 'agreed');
  assert.deepEqual(c.agreers, ['2', '3']);
});

test('אותו משתמש פעמיים נספר פעם אחת; verdict לא מוכר מתעלם', () => {
  assert.equal(consensus([a('1', 'print'), a('1', 'print')]).status, 'open');
  assert.equal(consensus([a('1', 'print'), a('2', 'bogus')]).status, 'open');
});
