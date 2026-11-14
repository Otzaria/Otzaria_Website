import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageInspectCache, imageStatKey, isStatSettled, RACY_WINDOW_MS } from './imageInspectCache.pure.js';

const MS = 1000000n;
const st = (over = {}) => ({ size: 100n, mtimeNs: 1000n * MS, ctimeNs: 1000n * MS, ino: 7n, dev: 1n, ...over });

test('imageStatKey: כל שדה בחתימה משנה אותה', () => {
  const base = imageStatKey(st());
  for (const over of [{ size: 101n }, { mtimeNs: 1000n * MS + 1n }, { ctimeNs: 1000n * MS + 1n }, { ino: 8n }, { dev: 2n }]) {
    assert.notEqual(imageStatKey(st(over)), base, JSON.stringify(Object.keys(over)));
  }
  assert.equal(imageStatKey(st()), base);
});

test('isStatSettled: רק כש-mtime וגם ctime ישנים מהחלון', () => {
  const now = 1000 + RACY_WINDOW_MS;
  assert.equal(isStatSettled(st(), now), true);
  assert.equal(isStatSettled(st(), now - 1), false);
  // ctime חדש (utimes החזיר mtime ישן) — לא התיישב
  assert.equal(isStatSettled(st({ ctimeNs: 1500n * MS }), now), false);
  assert.equal(isStatSettled(st({ mtimeNs: 1500n * MS }), now), false);
  // חותמת בעתיד (סטיית שעון)
  assert.equal(isStatSettled(st({ mtimeNs: 99999999n * MS }), now), false);
  assert.equal(isStatSettled(st(), Number.NaN), false);
  assert.equal(isStatSettled(st(), 1000, 0), true);
});

test('ImageInspectCache: פגיעה רק בחתימה זהה; חתימה שונה מוחקת את הרשומה', () => {
  const c = new ImageInspectCache(10);
  const v = { sha256: 'a'.repeat(64), width: 1, height: 2, orientation: 1 };
  c.set('/p/1.jpg', 'k1', v);
  const hit = c.get('/p/1.jpg', 'k1');
  assert.deepEqual(hit, v);
  hit.sha256 = 'mutated';
  assert.equal(c.get('/p/1.jpg', 'k1').sha256, 'a'.repeat(64), 'מוחזר עותק');
  v.width = 999;
  assert.equal(c.get('/p/1.jpg', 'k1').width, 1, 'נשמר עותק');
  assert.equal(c.get('/p/1.jpg', 'k2'), undefined);
  assert.equal(c.size, 0, 'חתימה שונה מוחקת');
  assert.equal(c.get('/p/1.jpg', 'k1'), undefined, 'ולא חוזרת לחתימה הישנה');
  assert.equal(c.get('/nope', 'k1'), undefined);
});

test('ImageInspectCache: מוגבל במספר רשומות, פליטה לפי LRU', () => {
  const c = new ImageInspectCache(2);
  c.set('a', 'k', { n: 1 });
  c.set('b', 'k', { n: 2 });
  assert.equal(c.get('a', 'k').n, 1); // a הכי טרי
  c.set('c', 'k', { n: 3 });
  assert.equal(c.size, 2);
  assert.equal(c.get('b', 'k'), undefined);
  assert.equal(c.get('a', 'k').n, 1);
  assert.equal(c.get('c', 'k').n, 3);
  c.set('a', 'k2', { n: 4 }); // עדכון לאותו נתיב — רשומה אחת
  assert.equal(c.size, 2);
  assert.equal(c.get('a', 'k2').n, 4);
  c.delete('a');
  c.clear();
  assert.equal(c.size, 0);
  assert.equal(new ImageInspectCache(0).maxEntries, 1);
});
