import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GUIDE_HTML, GUIDE_KEY, guideInput, renderGuide, sanitizeGuideHtml, guideCodes } from './guideContent.js';

test('המפתח ב-SystemConfig', () => {
  assert.equal(GUIDE_KEY, 'tzurat_hadaf_guide');
});

test('הנוסח המקורי: הפרקים שהממשק מקשר אליהם, תקין אחרי ניקוי, בלי קודים לא מוכרים', () => {
  for (const id of ['fast', 'print-decides', 'abbreviations', 'rashi-script', 'page-parts', 'lines', 'reports']) {
    assert.ok(DEFAULT_GUIDE_HTML.includes(`<section id="${id}">`), id);
  }
  assert.ok(!guideInput(DEFAULT_GUIDE_HTML).error);
  const r = renderGuide(DEFAULT_GUIDE_HTML);
  assert.deepEqual(r.unknown, []);
  assert.ok(r.toc.length >= 7);
  assert.equal(r.html.includes('[[ערך:'), false);
  assert.ok(r.html.includes('48'));
});

test('ניקוי: סקריפט, מאפיינים וקישורים מסוכנים יורדים', () => {
  const out = sanitizeGuideHtml('<section id="a"><h2 onclick="x()">כ</h2><script>alert(1)</script><a href="javascript:x">ק</a><p class="evil note">ט</p></section>');
  assert.equal(out.includes('script'), false);
  assert.equal(out.includes('onclick'), false);
  assert.equal(out.includes('javascript'), false);
  assert.ok(out.includes('<p class="note">'));
  assert.ok(guideInput('<p>בלי כותרת</p>').error);
  assert.ok(guideInput(42).error);
});

test('קודים: ערכים ידועים מוחלפים, לא מוכרים מדווחים', () => {
  const r = renderGuide('<section id="x"><h2>כ</h2><p>[[ערך:שעות]] [[ערך:אין]]</p></section>');
  assert.ok(r.html.includes('48'));
  assert.deepEqual(r.unknown, ['[[ערך:אין]]']);
  assert.ok(guideCodes().values.length > 0);
});
