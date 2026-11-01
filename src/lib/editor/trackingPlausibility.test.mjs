import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_ALIGNMENT, REASONS, assessAlignment, assessProfile, assessText, assessTracking, combineAssessments, textWordCount } from './trackingPlausibility.js';

// עמוד 1000×1600 עם n שורות בגובה 16, כל אחת עם `words` מילים
function page({ n = 40, h = 16, words = 10, x0 = 300, x1 = 700, stream = 'main', extra = [] } = {}) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const y = 100 + i * 30;
    const ws = Array.from({ length: words }, (_, k) => ({ bbox: [x1 - (k + 1) * 30, y, x1 - k * 30 - 6, y + h] }));
    lines.push({ id: `p${i}`, stream, bbox: [x0, y, x1, y + h], words: ws });
  }
  return { level: 'word', source: 'profile', size: [1000, 1600], lines: [...lines, ...extra] };
}
const words = (n) => Array.from({ length: n }, (_, i) => `מילה${i}`).join(' ');

test('assessProfile: עמוד רגיל — מילה', () => {
  assert.deepEqual(assessProfile(page()), { level: 'word', reasons: [] });
});

test('assessProfile: כמעט אין שורות / "שורה" שתופסת חצי עמוד — כבוי', () => {
  assert.deepEqual(assessProfile(page({ n: 2 })), { level: 'off', reasons: [REASONS.fewLines] });
  const tall = page({ extra: [{ stream: 'main', bbox: [300, 900, 700, 1590], words: [] }] });
  assert.equal(assessProfile(tall).level, 'off');
  assert.deepEqual(assessProfile(tall).reasons, [REASONS.tallLine]);
});

test('assessProfile: כמה שורות גבוהות בהרבה מהרגיל — שורה', () => {
  const big = [0, 1, 2].map((i) => ({ stream: 'main', bbox: [300, 1300 + i * 70, 700, 1360 + i * 70], words: [] }));
  const r = assessProfile(page({ extra: big }));
  assert.equal(r.level, 'line');
  assert.ok(r.reasons.includes(REASONS.outliers));
});

test('assessProfile: שורות רחבות ועמוסות בלי טורים — כנראה טורים שלא הופרדו; עם טורים — תקין', () => {
  const wide = page({ x0: 50, x1: 950, words: 24 });
  assert.equal(assessProfile(wide).level, 'line');
  assert.ok(assessProfile(wide).reasons.includes(REASONS.unsplit));
  assert.equal(assessProfile(page({ x0: 50, x1: 950, words: 24, stream: 'right' })).level, 'word');
  // שורה רחבה עם מעט מילים (ספר בטור אחד רחב) — תקין
  assert.equal(assessProfile(page({ x0: 50, x1: 950, words: 12 })).level, 'word');
});

test('textWordCount: בלי תגיות HTML', () => {
  assert.equal(textWordCount('<b>שלום</b> עולם\nשורה <i>שנייה</i>'), 4);
  assert.equal(textWordCount(''), 0);
});

test('assessText: יחס המילים בטקסט מול הצילום', () => {
  const lines = page({ n: 10, words: 10 }).lines; // 100 מילים בצילום
  assert.equal(assessText(words(95), lines).level, 'word');
  assert.equal(assessText(words(60), lines).level, 'line');
  assert.deepEqual(assessText(words(20), lines).reasons, [REASONS.textMismatch]);
  assert.equal(assessText(words(20), lines).level, 'off');
  assert.equal(assessText('', lines).level, 'word');
});

test('assessTracking: רק מקורות profile/local נבדקים; הרמה הנמוכה מבין הבדיקות; downgraded', () => {
  const p = page({ n: 10, words: 10 });
  assert.deepEqual(assessTracking({ source: p, lines: p.lines, text: words(100) }), { level: 'word', reasons: [], downgraded: false });
  // 60 מילים מול 100: יחס המילים (line) וגם עקביות היישור — הנמוכה מביניהן
  const bad = assessTracking({ source: p, lines: p.lines, text: words(60) });
  assert.notEqual(bad.level, 'word');
  assert.ok(bad.reasons.includes(REASONS.textMismatch));
  assert.equal(bad.downgraded, true);
  // layout עם אותן שורות — לא נבדק
  const layout = { ...p, source: 'layout' };
  assert.deepEqual(assessTracking({ source: layout, lines: p.lines, text: words(5) }), { level: 'word', reasons: [], downgraded: false });
  assert.equal(combineAssessments({ level: 'off', source: 'profile', lines: [] }, { level: 'off', reasons: [] }, null).downgraded, false);
});

// גוש "טקסט ראשי" (5 שורות של 4 מילים רחבות) ומתחתיו "הערות" (5 שורות של 16 מילים צרות)
function blocks() {
  const pattern = [...Array(5)].map(() => [96, 96, 96, 96]).concat([...Array(5)].map(() => Array(16).fill(24)));
  const lines = pattern.map((ws, i) => {
    const y = 100 + i * 30;
    let x = 900;
    const wds = ws.map((w) => {
      const b = [x - w, y, x, y + 16];
      x -= w + 10;
      return { bbox: b };
    });
    return { id: `p${i}`, stream: 'main', bbox: [x + 10, y, 900, y + 16], words: wds };
  });
  return { level: 'word', source: 'profile', size: [1000, 1600], lines };
}
const longs = (n) => Array(n).fill('א'.repeat(16));
const shorts = (n) => Array(n).fill('א'.repeat(4));

test('assessAlignment: ספים לפי חלק השורות המסכימות; מעט שורות — לא נבדק', () => {
  assert.deepEqual(assessAlignment({ agree: 9, total: 10 }), { level: 'word', reasons: [], ratio: 0.9 });
  assert.equal(assessAlignment({ agree: 6, total: 10 }).level, 'line');
  assert.deepEqual(assessAlignment({ agree: 4, total: 10 }).reasons, [REASONS.inconsistent]);
  assert.equal(assessAlignment({ agree: 4, total: 10 }).level, 'off');
  assert.equal(assessAlignment({ agree: 0, total: 3 }).level, 'word');
  assert.equal(assessAlignment(null).level, 'word');
});

test('assessTracking: סך המילים מסכים אבל הסדר שגוי (גושים בסדר הפוך) — לא מילה', () => {
  const p = blocks();
  const ok = assessTracking({ source: p, lines: p.lines, text: [...longs(20), ...shorts(80)].join(' ') });
  assert.deepEqual(ok, { level: 'word', reasons: [], downgraded: false });
  const bad = assessTracking({ source: p, lines: p.lines, text: [...shorts(80), ...longs(20)].join(' ') });
  assert.notEqual(bad.level, 'word');
  assert.ok(bad.reasons.includes(REASONS.inconsistent));
  assert.equal(bad.downgraded, true);
});

test('assessTracking: גם זיהוי מקומי (local) נבדק', () => {
  const p = { ...blocks(), source: 'local' };
  const bad = assessTracking({ source: p, lines: p.lines, text: [...shorts(80), ...longs(20)].join(' ') });
  assert.notEqual(bad.level, 'word');
  const few = assessTracking({ source: p, lines: p.lines, text: shorts(10).join(' ') });
  assert.equal(few.level, 'off');
});

test('combineAssessments: בדיקה ממתינה מורידה ל-line בלי לסמן downgraded', () => {
  const p = page({ n: 10, words: 10 });
  const r = combineAssessments(p, { level: 'word', reasons: [] }, { level: 'word', reasons: [] }, PENDING_ALIGNMENT);
  assert.deepEqual(r, { level: 'line', reasons: [], downgraded: false });
  const r2 = combineAssessments(p, { level: 'word', reasons: [] }, { level: 'off', reasons: [REASONS.textMismatch] }, PENDING_ALIGNMENT);
  assert.equal(r2.level, 'off');
  assert.equal(r2.downgraded, true);
});
