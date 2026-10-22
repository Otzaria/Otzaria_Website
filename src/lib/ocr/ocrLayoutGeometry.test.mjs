import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boxToSourceEnvelope, boxToSourceQuad, fromSourcePoint, toSourcePoint, wordBox } from './ocrLayoutGeometry.js';

const RESULT = JSON.parse(fs.readFileSync(new URL('./fixtures/localResultLayout.result.json', import.meta.url), 'utf8'));
const L1 = RESULT.pages[0].layout;
const M = L1.toSource;
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('עוגן החוזה: (208,299) → (228.70, 284.70) ±0.01; מרכז הסיבוב (874,1240.5) ממופה לעצמו', () => {
  const [x, y] = toSourcePoint(M, 208, 299);
  near(x, 228.7);
  near(y, 284.7);
  const [cx, cy] = toSourcePoint(M, 874, 1240.5);
  near(cx, 874);
  near(cy, 1240.5);
});

test('fromSourcePoint הופך את toSourcePoint; מטריצה סינגולרית → null', () => {
  for (const [x, y] of [[0, 0], [208, 299], [1748, 2481], [-5.5, 99.25]]) {
    const [sx, sy] = toSourcePoint(M, x, y);
    const [bx, by] = fromSourcePoint(M, sx, sy);
    near(bx, x, 1e-6);
    near(by, y, 1e-6);
  }
  assert.equal(fromSourcePoint([0, 0, 0, 0, 0, 0], 1, 1), null);
});

test('boxToSourceQuad (TL,TR,BR,BL) ו-boxToSourceEnvelope', () => {
  const box = L1.lines[0].bbox;
  const quad = boxToSourceQuad(M, box);
  assert.equal(quad.length, 4);
  assert.deepEqual(quad[0], toSourcePoint(M, box[0], box[1]));
  assert.deepEqual(quad[1], toSourcePoint(M, box[2], box[1]));
  assert.deepEqual(quad[2], toSourcePoint(M, box[2], box[3]));
  assert.deepEqual(quad[3], toSourcePoint(M, box[0], box[3]));
  const env = boxToSourceEnvelope(M, box);
  assert.equal(env[0], Math.min(...quad.map((p) => p[0])));
  assert.equal(env[3], Math.max(...quad.map((p) => p[1])));
  // מטריצת זהות (עמוד 2): המעטפה היא התיבה עצמה
  const id = RESULT.pages[1].layout.toSource;
  assert.deepEqual(boxToSourceEnvelope(id, [1, 2, 3, 4]), [1, 2, 3, 4]);
});

test('wordBox: x מהמילה, y מהשורה', () => {
  const line = L1.lines[0];
  assert.deepEqual(wordBox(line, line.words[2]), [208, 299, 420, 347]);
});
