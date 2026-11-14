import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionOf, effectiveQuestion, optionsFor, choiceToVerdict, verdictToChoice, focusOf, allowTextFor, replaceOrder } from './questions.js';

const rep = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', question: 'replace', otz: ['אמר'], print: ['א"ר'], n: 1 };
const pOnly = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', question: 'print_only', otz: [], print: ['גמ\''], n: 0 };
const oOnly = { _id: 'cccccccccccccccccccccccc', question: 'otz_only', otz: ['וכו\''], print: [], n: 1 };

test('questionOf: נגזר מ-n/print/cls כשאין question תקין', () => {
  assert.equal(questionOf({ otz: ['א'], print: ['ב'], n: 1 }), 'replace');
  assert.equal(questionOf({ otz: [], print: ['ב'], n: 0 }), 'print_only');
  assert.equal(questionOf({ otz: ['א'], print: [], n: 1 }), 'otz_only');
  assert.equal(questionOf({ cls: 'd_paren_ref', otz: ['א'], print: [], n: 1 }), 'paren');
  assert.equal(questionOf({ question: 'otz_only', otz: ['א'], print: ['ב'] }), 'otz_only');
  assert.equal(questionOf({ question: 'zzz', otz: ['א'], print: ['ב'], n: 1 }), 'replace');
});

test('paren — לפי הצד שאינו ריק', () => {
  assert.equal(effectiveQuestion({ question: 'paren', otz: ['א'], print: [], n: 1 }), 'otz_only');
  assert.equal(effectiveQuestion({ question: 'paren', otz: [], print: ['ב'], n: 0 }), 'print_only');
});

test('replace: שתי קריאות עיוורות, סדר קבוע לפריט ולמשתמש', () => {
  const o1 = optionsFor(rep, 'u1');
  assert.deepEqual(o1.map((o) => o.id), ['a', 'b']);
  assert.deepEqual(optionsFor(rep, 'u1'), o1);
  assert.ok(o1.every((o) => !('side' in o) && !('verdict' in o)));
  const words = o1.map((o) => o.words[0]).sort();
  assert.deepEqual(words, ['א"ר', 'אמר'].sort());
  // לפחות משתמש אחד מתוך כמה מקבל סדר הפוך
  const orders = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map((u) => replaceOrder(rep._id, u)));
  assert.equal(orders.size, 2);
  assert.equal(allowTextFor(rep), true);
  assert.equal(focusOf(rep), null);
});

test('replace: choice ← verdict וחזרה', () => {
  for (const u of ['u1', 'u2', 'u3', 'u4']) {
    const opts = optionsFor(rep, u);
    const otzOpt = opts.find((o) => o.words[0] === 'אמר').id;
    const printOpt = opts.find((o) => o.words[0] === 'א"ר').id;
    assert.deepEqual(choiceToVerdict(rep, u, otzOpt), { verdict: 'otz', text: null });
    assert.deepEqual(choiceToVerdict(rep, u, printOpt), { verdict: 'print', text: null });
    assert.equal(verdictToChoice(rep, u, 'otz'), otzOpt);
    assert.equal(verdictToChoice(rep, u, 'print'), printOpt);
  }
  assert.ok(choiceToVerdict(rep, 'u1', 'yes').error);
});

test('print_only: כן ← print, לא ← otz', () => {
  assert.deepEqual(optionsFor(pOnly, 'u').map((o) => o.id), ['yes', 'no']);
  assert.deepEqual(focusOf(pOnly), ["גמ'"]);
  assert.equal(choiceToVerdict(pOnly, 'u', 'yes').verdict, 'print');
  assert.equal(choiceToVerdict(pOnly, 'u', 'no').verdict, 'otz');
  assert.equal(verdictToChoice(pOnly, 'u', 'print'), 'yes');
  assert.equal(allowTextFor(pOnly), false);
});

test('otz_only: כאן ← otz, סמוך ← elsewhere, לא נדפס ← print', () => {
  assert.deepEqual(optionsFor(oOnly, 'u').map((o) => o.id), ['here', 'elsewhere', 'none']);
  assert.equal(choiceToVerdict(oOnly, 'u', 'here').verdict, 'otz');
  assert.equal(choiceToVerdict(oOnly, 'u', 'yes').verdict, 'otz');
  assert.equal(choiceToVerdict(oOnly, 'u', 'elsewhere').verdict, 'elsewhere');
  assert.equal(choiceToVerdict(oOnly, 'u', 'none').verdict, 'print');
  assert.equal(verdictToChoice(oOnly, 'u', 'elsewhere'), 'elsewhere');
  assert.equal(verdictToChoice(oOnly, 'u', 'print'), 'none');
});

test('unclear ו-other תמיד אפשריים; other דורש טקסט', () => {
  assert.deepEqual(choiceToVerdict(pOnly, 'u', 'unclear'), { verdict: 'unclear', text: null });
  assert.deepEqual(choiceToVerdict(rep, 'u', 'other', '  אמר  רב '), { verdict: 'other', text: 'אמר רב' });
  assert.ok(choiceToVerdict(rep, 'u', 'other', '   ').error);
  assert.ok(choiceToVerdict(rep, 'u', 'other', 'א'.repeat(201)).error);
});
