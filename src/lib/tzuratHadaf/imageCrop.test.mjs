import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropRect, relBox, fracCrop, MIN_CROP_W, MIN_CROP_H } from './imageCrop.js';
import { fastItemShape, pageStateFor, pageShape, imageVersion } from './shapes.js';

const W = 2600;
const H = 3500;

test('cropRect: ריפוד סביב התיבה, בתוך התמונה, בגודל מינימלי', () => {
  const box = { x: 0.4, y: 0.2, w: 0.06, h: 0.016 };
  const r = cropRect(box, W, H);
  const bx = 0.4 * W;
  const by = 0.2 * H;
  assert.ok(r.left < bx && r.left + r.width > bx + 0.06 * W);
  assert.ok(r.top < by && r.top + r.height > by + 0.016 * H);
  assert.ok(r.width >= MIN_CROP_W && r.height >= MIN_CROP_H);
  // ריפוד אנכי ≈ 1.5 × גובה התיבה
  assert.ok(Math.abs(by - r.top - 1.5 * 0.016 * H) < 2);
});

test('cropRect: ליד הקצה — נשאר בתוך התמונה', () => {
  const r = cropRect({ x: 0.97, y: 0.98, w: 0.03, h: 0.02 }, W, H);
  assert.ok(r.left >= 0 && r.top >= 0);
  assert.ok(r.left + r.width <= W && r.top + r.height <= H);
  assert.equal(cropRect(null, W, H), null);
  assert.equal(cropRect({ x: 0.9, y: 0, w: 0.2, h: 0.1 }, W, H), null);
});

test('relBox: התיבה כשברים בתוך החיתוך', () => {
  const box = { x: 0.4, y: 0.2, w: 0.06, h: 0.016 };
  const r = cropRect(box, W, H);
  const b = relBox(box, r, W, H);
  assert.ok(b.x > 0 && b.y > 0 && b.x + b.w < 1 && b.y + b.h < 1);
  assert.ok(Math.abs(b.x - (box.x * W - r.left) / r.width) < 0.001);
});

test('fracCrop: בלי פרמטרים — null; לא תקין — error', () => {
  assert.equal(fracCrop(new URLSearchParams(''), W, H), null);
  assert.ok(fracCrop(new URLSearchParams('x=0.5&y=0&w=0.6&h=0.1'), W, H).error);
  const c = fracCrop(new URLSearchParams('x=0.1&y=0.2&w=0.5&h=0.25'), W, H);
  assert.deepEqual(c, { left: 260, top: 700, width: 1300, height: 875 });
});

test('fastItemShape: עיוור, עם חיתוך ותיבה יחסית', () => {
  const page = { _id: 'p1', scan: { path: '/uploads/x.png', w: W, h: H }, buildId: 'b1', round: 1, masechet: 'ברכות', daf: 'ב.' };
  const item = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    slug: 'berakhot',
    kind: 'g',
    question: 'replace',
    otz: ['א'],
    print: ['ב'],
    n: 1,
    box: { x: 0.4, y: 0.2, w: 0.06, h: 0.016 },
    hints: { te: 'print' },
    answers: [{ user: 'x', verdict: 'print' }],
    ctxBefore: ['ג'],
    ctxAfter: [],
  };
  const f = fastItemShape(item, page, 'u1');
  assert.deepEqual(Object.keys(f).sort(), [
    'allowText', 'box', 'ctxAfter', 'ctxBefore', 'daf', 'focus', 'fullBox', 'fullImageUrl', 'id', 'imageUrl', 'kind', 'kindLabel', 'masechet', 'options', 'prompt', 'question', 'revision', 'slug',
  ].sort());
  assert.equal(f.kindLabel, 'גמרא');
  assert.match(f.imageUrl, /^\/api\/tzurat-hadaf\/items\/a{24}\/image\?v=/);
  assert.match(f.fullImageUrl, /full=1/);
  assert.ok(f.box.x > 0 && f.box.w > 0);
  assert.equal(JSON.stringify(f).includes('hints'), false);
  // בלי תיבה — אין חיתוך
  const g = fastItemShape({ ...item, box: null }, page, 'u1');
  assert.equal(g.imageUrl, null);
  assert.equal(g.box, null);
  assert.notEqual(imageVersion(page), imageVersion({ ...page, buildId: 'b2' }));
});

test('pageStateFor: מצבים בעיני הצופה', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const later = new Date('2026-10-21T10:00:00Z');
  const base = { status: 'open', required: 1, activeCount: 0, submitters: [] };
  assert.equal(pageStateFor(base, 'u1', null, now), 'open');
  assert.equal(pageStateFor({ ...base, leasedBy: 'u1', leasedUntil: later }, 'u1', null, now), 'mine');
  assert.equal(pageStateFor({ ...base, leasedBy: 'u2', leasedUntil: later }, 'u1', null, now), 'taken');
  assert.equal(pageStateFor({ ...base, leasedBy: 'u2', leasedUntil: new Date('2026-10-19') }, 'u1', null, now), 'open');
  assert.equal(pageStateFor({ ...base, activeCount: 1, submitters: ['u1'] }, 'u1', null, now), 'submitted');
  assert.equal(pageStateFor({ ...base, activeCount: 1, submitters: ['u2'] }, 'u1', null, now), 'done');
  assert.equal(pageStateFor({ ...base, required: 2, activeCount: 1, submitters: ['u2'] }, 'u1', null, now), 'open');
  assert.equal(pageStateFor({ ...base, status: 'done' }, 'u1', 'approved', now), 'approved');
  assert.equal(pageStateFor({ ...base, status: 'done' }, 'u1', null, now), 'done');
  assert.equal(pageStateFor({ ...base, status: 'closed' }, 'u1', null, now), 'closed');
});

test('pageShape: כתובות יחסיות עם גרסה', () => {
  const p = pageShape({ _id: 'p1', slug: 's', dafKey: '002a', daf: 'ב.', scan: { path: '/u/a.png', w: 10, h: 20 }, ours: null, buildId: 'b' }, 'open');
  assert.match(p.scan.url, /^\/api\/tzurat-hadaf\/pages\/p1\/image\?side=scan&v=/);
  assert.equal(p.ours.url, null);
  assert.deepEqual(p.model, { blocks: [] });
});

test('quantizeBox: מתרחב לרשת 1/200 (חיתוכים חוזרים — אותו מפתח במטמון)', async () => {
  const { quantizeBox, CROP_GRID } = await import('./imageCrop.js');
  const q = quantizeBox({ x: 0.1234, y: 0.5001, w: 0.1, h: 0.0333 });
  const g = 1 / CROP_GRID;
  assert.ok(q.x <= 0.1234 && q.x + q.w >= 0.2234 - 1e-12);
  assert.ok(Math.abs(q.x / g - Math.round(q.x / g)) < 1e-6 && Math.abs((q.x + q.w) / g - Math.round((q.x + q.w) / g)) < 1e-6);
  assert.deepEqual(quantizeBox({ x: 0.12341, y: 0.5, w: 0.1, h: 0.03 }), quantizeBox({ x: 0.1236, y: 0.5, w: 0.0999, h: 0.03 }));
  assert.ok(q.x + q.w <= 1 && q.y + q.h <= 1);
});
