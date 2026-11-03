/**
 * סימוני המתנדב (marks.js), הצורה שנשלחת לדפדפן (shape.js) והגישה (accessRules.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkOcrMark, checkRouterMark, normalizeLineText, sameResult } from './marks.js';
import { publicItem } from './shape.js';
import { accessOf, canProof, canRequest } from './accessRules.js';
import { parseUid, uidFitsSection, safeZipPath, validBox, OCR_KEYS, ROUTER_KEYS } from './vocab.js';
import { ocrItem, routerItem } from './testFixtures.js';

const P = ocrItem(0);

test('ocr: כל הפעולות; "תקן" עם טקסט זהה = "נכון"; טקסט מנורמל', () => {
  for (const action of ['ok', 'seg', 'skip', 'bad', 'router']) assert.deepEqual(checkOcrMark(P, { action }), { result: { action } });
  assert.deepEqual(checkOcrMark(P, { action: 'fixed', text: `  ${P.text}  ` }), { result: { action: 'ok' } });
  assert.deepEqual(checkOcrMark(P, { action: 'fixed', text: 'אמר  רבי\tיצחק' }), { result: { action: 'fixed', text: 'אמר רבי יצחק' } });
  assert.match(checkOcrMark(P, { action: 'fixed', text: '   ' }).error, /ריק/);
  assert.match(checkOcrMark(P, { action: 'fixed' }).error, /חסר/);
  assert.match(checkOcrMark(P, { action: 'nope' }).error, /לא מוכרת/);
  assert.equal(normalizeLineText('a  b'), 'a b');
});

test('router: כתב לשורה, פסול, מעורבת עם מילים; words_src לפי התיבות', () => {
  const R = routerItem(0);
  assert.deepEqual(checkRouterMark(R, { label: 'rashi' }), { result: { label: 'rashi', bad: false } });
  assert.deepEqual(checkRouterMark(R, { bad: true, label: 'square' }), { result: { label: '', bad: true } });
  assert.match(checkRouterMark(R, { label: 'mixed' }).error, /לכל מילה/);
  assert.match(checkRouterMark(R, { label: 'x' }).error, /לא מוכר/);

  const same = R.words.map((w) => ({ k: w.k, box: w.box, label: w.k === 2 ? 'rashi' : 'square' }));
  const r1 = checkRouterMark(R, { label: 'mixed', words: same });
  assert.equal(r1.result.words_src, 'station');
  assert.equal(r1.result.words.length, 4);

  const site = [
    { k: 0, box: [300, 0, 540, 54], label: 'square' },
    { k: 1, box: [10, 0, 290, 54], label: 'rashi' },
  ];
  assert.equal(checkRouterMark(R, { label: 'mixed', words: site }).result.words_src, 'site');
  // שורה בלי מילים מהתחנה — החלוקה תמיד "site"
  assert.equal(checkRouterMark(routerItem(2), { label: 'mixed', words: site }).result.words_src, 'site');

  assert.match(checkRouterMark(R, { label: 'mixed', words: [{ k: 0, box: [0, 0, 900, 54], label: 'square' }] }).error, /תיבה/);
  assert.match(checkRouterMark(R, { label: 'mixed', words: [{ k: 0, box: [0, 0, 9, 54] }] }).error, /כתב/);
  assert.match(
    checkRouterMark(R, { label: 'mixed', words: [{ k: 1, box: [0, 0, 9, 54], label: 'rashi' }, { k: 1, box: [10, 0, 19, 54], label: 'rashi' }] }).error,
    /כפול/
  );
});

test('sameResult — "שיעור ההתאמה"', () => {
  assert.equal(sameResult('ocr', { action: 'fixed', text: 'א' }, { action: 'fixed', text: 'א' }), true);
  assert.equal(sameResult('ocr', { action: 'fixed', text: 'א' }, { action: 'fixed', text: 'ב' }), false);
  assert.equal(sameResult('router', { label: 'rashi' }, { label: 'square' }), false);
  const w = [{ k: 0, box: [0, 0, 5, 5], label: 'rashi' }];
  assert.equal(sameResult('router', { label: 'mixed', words: w }, { label: 'mixed', words: [{ ...w[0], label: 'square' }] }), false);
  assert.equal(sameResult('router', { label: 'mixed', words: w }, { label: 'mixed', words: w }), true);
});

test('publicItem: בלי book ובלי conf; תמונה דרך נתיב מוגן', () => {
  const d = { _id: 'abc', section: 'ocr', status: 'held', payload: ocrItem(0), ctxPath: null };
  const s = publicItem(d);
  assert.equal(s.img, '/api/training-proof/items/abc/image');
  assert.equal(s.alias, 'ספר 412');
  assert.equal(s.track, 'rashi');
  assert.equal('book' in s, false);
  assert.equal('conf' in s, false);
  assert.equal(JSON.stringify(s).includes('b-5e0c'), false);
  assert.equal(s.result, null);
  const withCtx = publicItem({ ...d, ctxPath: '/x', payload: ocrItem(0, { ctx: { img: 'img/c.png', bbox: [1, 2, 3, 4] } }) });
  assert.deepEqual(withCtx.ctx, { img: '/api/training-proof/items/abc/ctx', bbox: [1, 2, 3, 4] });
  const r = publicItem({ _id: 'r1', section: 'router', status: 'submitted', result: { label: 'rashi' }, payload: routerItem(0) });
  assert.equal(r.words.length, 4);
  assert.deepEqual(r.result, { label: 'rashi' });
  assert.equal(r.ctx, null);
  // נתב עם עמוד מלא (§4.2) — אותה צורה ואותו נתיב מוגן כמו בזיהוי
  const rc = publicItem({ _id: 'r2', section: 'router', status: 'held', ctxPath: '/y', payload: routerItem(0, { ctx: { img: 'img/c.jpg', bbox: [5, 6, 7, 8] } }) });
  assert.deepEqual(rc.ctx, { img: '/api/training-proof/items/r2/ctx', bbox: [5, 6, 7, 8] });
});

test('accessOf: מנהל OCR, מגיה מאושר, ממתין, נדחה, בלי רשומה', () => {
  assert.equal(accessOf({ role: 'admin' }, null), 'admin');
  assert.equal(accessOf({ role: 'admin_ocr' }, null), 'admin');
  assert.equal(accessOf({ role: 'model_trainer' }, { status: 'denied' }), 'admin');
  assert.equal(accessOf({ role: 'admin_books' }, null), 'none');
  assert.equal(accessOf({ role: 'user' }, { status: 'approved' }), 'approved');
  assert.equal(accessOf({ role: 'user' }, { status: 'pending' }), 'pending');
  assert.equal(accessOf({ role: 'user' }, null), 'none');
  assert.equal(canProof('approved') && canProof('admin') && !canProof('pending'), true);
  assert.equal(canRequest('none') && canRequest('denied') && !canRequest('pending') && !canRequest('approved'), true);
});

test('vocab: uid, נתיבים, תיבות, מקשים', () => {
  assert.deepEqual(parseUid('ocr:lines:22710'), { section: 'ocr', table: 'lines', id: '22710' });
  assert.equal(uidFitsSection('router:rlines:7', 'router'), true);
  assert.equal(uidFitsSection('router:lines:7', 'router'), false);
  assert.equal(safeZipPath('img/a.webp'), true);
  assert.equal(safeZipPath('img//a.webp'), false);
  assert.equal(safeZipPath('./img/a.webp'), false);
  assert.equal(validBox([0, 0, 10, 10], 10, 10), true);
  assert.equal(validBox([0, 0, 12, 10], 10, 10), false);
  assert.equal(OCR_KEYS[6], 'router');
  assert.equal(ROUTER_KEYS[4], 'mixed');
});
