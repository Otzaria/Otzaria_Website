import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageHasText, buildPageUpdate } from './runOcrJob.pure.js';

// ==================== pageHasText ====================

test('pageHasText: true כשיש content', () => {
  assert.equal(pageHasText({ content: 'שלום' }), true);
});

test('pageHasText: true כשיש rightColumn בלבד', () => {
  assert.equal(pageHasText({ rightColumn: 'טקסט' }), true);
});

test('pageHasText: true כשיש leftColumn בלבד', () => {
  assert.equal(pageHasText({ leftColumn: 'טקסט' }), true);
});

test('pageHasText: false כשהכל ריק/רווחים בלבד', () => {
  assert.equal(pageHasText({ content: '   ', rightColumn: '', leftColumn: '\n' }), false);
});

test('pageHasText: false כשאין שדות טקסט כלל', () => {
  assert.equal(pageHasText({}), false);
});

test('pageHasText: false כששדות הם undefined/null', () => {
  assert.equal(pageHasText({ content: undefined, rightColumn: null }), false);
});

// ==================== buildPageUpdate ====================

test('buildPageUpdate: מחזיר content ומאפס טורים ל-two-columns', () => {
  assert.deepEqual(buildPageUpdate('טקסט מזוהה'), {
    content: 'טקסט מזוהה',
    rightColumn: '',
    leftColumn: '',
    isTwoColumns: false,
  });
});

test('buildPageUpdate: מחרוזת ריקה נשמרת כ-content ריק', () => {
  assert.deepEqual(buildPageUpdate(''), {
    content: '',
    rightColumn: '',
    leftColumn: '',
    isTwoColumns: false,
  });
});
