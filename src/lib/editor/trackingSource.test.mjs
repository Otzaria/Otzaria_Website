import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OFF,
  SOURCE_PRIORITY,
  fromLayout,
  fromProof,
  fromTesseract,
  fromProfile,
  fromRuler,
  normalizeSource,
  pickSource,
  splitColumnStreams,
  streamsOf,
  streamLines,
} from './trackingSource.js';
import { toSourcePoint } from '../ocr/ocrLayoutGeometry.js';

const fixture = JSON.parse(readFileSync(new URL('../ocr/fixtures/localResultLayout.result.json', import.meta.url), 'utf8'));
const layout = fixture.pages[0].layout;
const xsDesc = (ws) => ws.every((w, i) => i === 0 || ws[i - 1].bbox[0] >= w.bbox[0]);

test('fromLayout: fixture v1 — מילים, טקסטים, ביטחון, סדר קריאה', () => {
  const s = fromLayout(layout);
  assert.equal(s.level, 'word');
  assert.equal(s.source, 'layout');
  assert.deepEqual(s.size, [1748, 2481]);
  // הכותרת (order 1) לפני הגוף (order 2) ולפני הריהוט (order 3)
  assert.deepEqual(s.lines.map((l) => l.stream), ['main_heading', 'main', 'footer']);
  const body = s.lines[1];
  assert.equal(body.id, 0);
  assert.deepEqual(body.words.map((w) => w.text), ['בראשית', 'ברא', 'אלהים']);
  assert.deepEqual(body.words.map((w) => w.conf), [0.998, 0.974, 0.993]);
  assert.ok(xsDesc(body.words));
  assert.equal(s.regions.length, 3);
  assert.equal(s.regions.find((r) => r.id === 'm3').stream, 'footer');
});

test('fromLayout: toSource מוחל — מעטפת מכילה את פינות התיבה הממופות', () => {
  const s = fromLayout(layout);
  const raw = layout.lines[0];
  const [x, y] = toSourcePoint(layout.toSource, raw.bbox[0], raw.bbox[1]);
  const b = s.lines[1].bbox;
  assert.ok(x >= b[0] - 0.01 && x <= b[2] + 0.01 && y >= b[1] - 0.01 && y <= b[3] + 0.01);
});

test('fromLayout: JSON כמחרוזת, wordTexts מפורש, מספר מילים שלא תואם — בלי טקסט', () => {
  assert.equal(fromLayout(JSON.stringify(layout)).level, 'word');
  const L = {
    layoutVersion: 1,
    toSource: [1, 0, 0, 0, 1, 0],
    image: { width: 100, height: 100 },
    lines: [
      { k: 0, text: 'אב גד', bbox: [0, 0, 100, 10], stream: 'main', words: [[0, 40, 0.9], [60, 100, 0.8]], wordTexts: ['X', 'Y'] },
      { k: 1, text: 'אב', bbox: [0, 20, 100, 30], stream: 'main', words: [[0, 40], [60, 100]] },
      { k: 2, text: 'בלי מילים', bbox: [0, 40, 100, 50], stream: 'notes', words: null },
    ],
  };
  const s = fromLayout(L);
  assert.deepEqual(s.lines[0].words.map((w) => w.text), ['Y', 'X']); // ממוין x יורד
  assert.deepEqual(s.lines[0].words.map((w) => w.bbox), [[60, 0, 100, 10], [0, 0, 40, 10]]);
  assert.equal(s.lines[1].words[0].text, undefined);
  assert.equal(s.lines[1].words[0].conf, undefined);
  assert.equal(s.lines[2].words, undefined);
});

test('fromLayout: קלט לא תקין → off', () => {
  assert.equal(fromLayout(null), OFF);
  assert.equal(fromLayout('{not json'), OFF);
  assert.equal(fromLayout({ layoutVersion: 2, lines: [] }), OFF);
  assert.equal(fromLayout({ layoutVersion: 1, lines: [] }), OFF);
  assert.equal(fromLayout({ layoutVersion: 1, lines: [{ bbox: [5, 5, 1, 1] }] }), OFF);
});

test('fromLayout: שורות בלי מילים → level line; מטריצה סינגולרית → זהות', () => {
  const s = fromLayout({ layoutVersion: 1, toSource: [0, 0, 0, 0, 0, 0], image: { width: 10, height: 10 }, lines: [{ k: 0, bbox: [1, 2, 3, 4], words: [] }] });
  assert.equal(s.level, 'line');
  assert.deepEqual(s.lines[0].bbox, [1, 2, 3, 4]);
  assert.equal(s.lines[0].stream, 'main');
});

const proofDoc = {
  size: [1000, 2000],
  lines: [
    { id: 1, bbox: [0, 0, 1000, 50], stream: 'main', text: 'אב גד', words: [{ bbox: [0, 0, 400, 0], conf: 0.7 }, { bbox: [600, 0, 1000, 50], conf: 0.99 }] },
    { id: 2, bbox: [0, 60, 1000, 110], stream: 'main', text: 'נמחק', status: 'removed' },
    { id: 3, bbox: [0, 120, 500, 170], stream: 'notes', text: 'הערה', words: [{ text: 'הערה' }] },
  ],
  frames: [{ fid: 'f1', bbox: [0, 0, 1000, 120], stream: 'main' }],
};

test('fromProof: מילים, גובה-אפס → גובה השורה, טקסט מפיצול, שורות שהוסרו', () => {
  const s = fromProof(proofDoc);
  assert.equal(s.source, 'proof');
  assert.equal(s.level, 'word');
  assert.deepEqual(s.lines.map((l) => l.id), [1, 3]);
  const w = s.lines[0].words;
  assert.deepEqual(w.map((x) => x.text), ['גד', 'אב']);
  assert.deepEqual(w[1].bbox, [0, 0, 400, 50]);
  assert.equal(w[1].conf, 0.7);
  assert.equal(s.lines[1].words, undefined); // מילה בלי תיבה
  assert.deepEqual(s.regions, [{ id: 'f1', stream: 'main', bbox: [0, 0, 1000, 120] }]);
});

test('fromProof: imageSize שונה — קנה מידה', () => {
  const s = fromProof(proofDoc, { imageSize: [500, 1000] });
  assert.deepEqual(s.size, [500, 1000]);
  assert.deepEqual(s.lines[0].bbox, [0, 0, 500, 25]);
  assert.equal(fromProof(null), OFF);
  assert.equal(fromProof({ lines: [] }), OFF);
});

test('fromTesseract: data.lines, confidence → 0..1, scale, מילים ריקות', () => {
  const res = {
    data: {
      lines: [
        {
          text: 'אב גד\n',
          bbox: { x0: 0, y0: 0, x1: 200, y1: 20 },
          words: [
            { text: 'גד', bbox: { x0: 0, y0: 0, x1: 80, y1: 20 }, confidence: 91 },
            { text: 'אב', bbox: { x0: 120, y0: 0, x1: 200, y1: 20 }, confidence: 40 },
            { text: ' ', bbox: { x0: 90, y0: 0, x1: 100, y1: 20 }, confidence: 0 },
          ],
        },
        { text: 'x', bbox: null, words: [] },
      ],
    },
  };
  const s = fromTesseract(res, { scale: 2 });
  assert.equal(s.source, 'local');
  assert.equal(s.lines.length, 1);
  assert.deepEqual(s.lines[0].bbox, [0, 0, 100, 10]);
  assert.deepEqual(s.lines[0].words.map((w) => [w.text, w.conf]), [['אב', 0.4], ['גד', 0.91]]);
  assert.deepEqual(s.size, [100, 10]);
  assert.equal(s.lines[0].text, 'אב גד');
});

test('fromTesseract: blocks→paragraphs→lines (v5+), size מפורש', () => {
  const s = fromTesseract({ blocks: [{ paragraphs: [{ lines: [{ text: 'א', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 }, words: [] }] }] }] }, { size: [50, 60] });
  assert.equal(s.level, 'line');
  assert.deepEqual(s.size, [50, 60]);
  assert.equal(fromTesseract({}), OFF);
});

test('fromProfile: טווחי מילים בשני הפורמטים', () => {
  const s = fromProfile({ size: [100, 100], lines: [{ bbox: [0, 10, 100, 20], words: [[0, 30], { x0: 60, x1: 100 }, [5, 5]] }, { bbox: [0, 30, 100, 40] }] });
  assert.equal(s.level, 'word');
  assert.deepEqual(s.lines[0].words.map((w) => w.bbox), [[60, 10, 100, 20], [0, 10, 30, 20]]);
  assert.equal(s.lines[1].words, undefined);
  assert.equal(fromProfile(null), OFF);
});

test('fromRuler: שורות במרווח קבוע, count או עד תחתית התמונה', () => {
  const s = fromRuler({ size: [100, 100], x0: 10, x1: 90, y: 20, pitch: 25 });
  assert.equal(s.level, 'ruler');
  assert.equal(s.source, 'manual');
  assert.deepEqual(s.lines.map((l) => l.bbox), [[10, 20, 90, 45], [10, 45, 90, 70], [10, 70, 90, 95]]);
  assert.equal(fromRuler({ x0: 0, x1: 10, y: 0, pitch: 5, count: 2 }).lines.length, 2);
  assert.equal(fromRuler({ x0: 0, x1: 10, y: 0, pitch: 0 }), OFF);
  assert.equal(fromRuler(null), OFF);
});

test('normalizeSource: מקור לא מוכר / קלט חסר', () => {
  assert.equal(normalizeSource(/** @type {any} */ ('nope'), {}), OFF);
  assert.equal(normalizeSource('layout', undefined), OFF);
  assert.equal(normalizeSource('proof', proofDoc).source, 'proof');
});

test('pickSource: לפי סדר העדיפות', () => {
  assert.deepEqual(SOURCE_PRIORITY, ['layout', 'proof', 'local', 'profile', 'manual']);
  const ruler = { x0: 0, x1: 10, y: 0, pitch: 5, count: 1 };
  assert.equal(pickSource({ layout, proof: proofDoc, manual: ruler }).source, 'layout');
  assert.equal(pickSource({ layout: 'garbage', proof: proofDoc }).source, 'proof');
  assert.equal(pickSource({ manual: ruler }).level, 'ruler');
  assert.equal(pickSource({}), OFF);
  assert.equal(pickSource(null), OFF);
});

test('pickSource: minLevel מעדיף מילים מקומיות על פני layout ברמת שורה', () => {
  const lineOnly = { layoutVersion: 1, image: { width: 10, height: 10 }, lines: [{ k: 0, bbox: [0, 0, 10, 5], words: null }] };
  const local = { lines: [{ text: 'א', bbox: { x0: 0, y0: 0, x1: 10, y1: 5 }, words: [{ text: 'א', bbox: { x0: 0, y0: 0, x1: 10, y1: 5 }, confidence: 90 }] }] };
  assert.equal(pickSource({ layout: lineOnly, local }).source, 'layout');
  assert.equal(pickSource({ layout: lineOnly, local }, { minLevel: 'word' }).source, 'local');
  // אף מקור אינו ברמת מילה — הראשון שנותן משהו
  assert.equal(pickSource({ layout: lineOnly }, { minLevel: 'word' }).source, 'layout');
  assert.equal(pickSource({ layout, local }, { order: ['local', 'layout'] }).source, 'local');
  assert.deepEqual(pickSource({ proof: proofDoc }, { opts: { proof: { imageSize: [500, 1000] } } }).size, [500, 1000]);
});

test('streamsOf / streamLines', () => {
  const s = fromLayout(layout);
  assert.deepEqual(streamsOf(s), ['main_heading', 'main', 'footer']);
  assert.deepEqual(streamLines(s, 'main').map((l) => l.id), [0]);
  assert.deepEqual(streamLines(OFF, 'main'), []);
  assert.deepEqual(streamsOf(null), []);
});

// שורות בזרם אחד (כמו מזיהוי מקומי): x0..x1 לכל שורה, בגובה עולה
const local = (spans) => ({
  level: 'word',
  source: 'local',
  size: [1000, 1400],
  lines: spans.map(([a, b], i) => ({ id: `t${i}`, stream: 'main', bbox: [a, 100 + i * 20, b, 114 + i * 20] })),
});

test('splitColumnStreams: שני טורים — ימין/שמאל לפי המרכז, שורה רחבה — main, הסדר נשמר', () => {
  const right = [[540, 950], [540, 950], [700, 950], [540, 950]];
  const left = [[50, 460], [50, 460], [50, 300], [50, 460]];
  const src = local([[50, 950], ...right, ...left, [50, 950]]);
  const out = splitColumnStreams(src);
  assert.deepEqual(out.lines.map((l) => l.stream), ['main', 'right', 'right', 'right', 'right', 'left', 'left', 'left', 'left', 'main']);
  assert.deepEqual(out.lines.map((l) => l.id), src.lines.map((l) => l.id));
  assert.equal(src.lines[1].stream, 'main'); // המקור לא השתנה
  // שורה קצרה חריגה ליד האמצע (כותרת) לא מזיזה את קו החלוקה אל תוך הטור הימני
  const odd = splitColumnStreams(local([...right, [380, 560], ...left, ...right]));
  assert.deepEqual(odd.lines.map((l) => l.stream[0]).join(''), 'rrrrlllllrrrr');
});

test('splitColumnStreams: טור אחד (גם עם שורות קצרות) / מעט שורות — בלי שינוי', () => {
  const one = local([[50, 950], [50, 950], [400, 950], [50, 950], [600, 950], [50, 950], [50, 700], [50, 950]]);
  assert.equal(splitColumnStreams(one), one);
  const few = local([[540, 950], [50, 460]]);
  assert.equal(splitColumnStreams(few), few);
  // שורות צרות שחוצות את האמצע (טור צר במרכז) — אין תעלה
  const centered = local([[300, 700], [320, 680], [300, 700], [700, 950], [300, 700], [310, 690], [50, 300]]);
  assert.equal(splitColumnStreams(centered), centered);
});
