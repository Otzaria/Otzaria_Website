// דף ההנחיות להגהת עמודים — התוכן שנערך מדף הניהול (guideContent.js): הניקוי לרשימת-היתר, הקודים (איור/כפתור/ערך),
// תוכן-הדף מהפרקים, והנוסח המקורי.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GUIDE_HTML,
  GUIDE_FIGURES,
  MAX_GUIDE_HTML,
  guideCodes,
  guideInput,
  renderGuide,
  sanitizeGuideHtml,
} from './guideContent.js';
import { STAGE_TEXT } from './stages.js';
import { CLAIM_HOURS, MAX_HELD } from './gridState.js';

test('הניקוי: רק רשימת-ההיתר — בלי סקריפט, אירועים, סגנון, iframe וקישורי javascript', () => {
  const dirty =
    '<section id="a" onclick="x()"><h2 style="color:red">כותרת</h2><script>alert(1)</script><iframe src="//x"></iframe>' +
    '<p class="note evil">טקסט <img src=x onerror=alert(1)> <a href="javascript:alert(1)">רע</a> <a href="/library/page-proof">טוב</a> <a href="https://otzaria.org/x">חוץ</a></p></section>';
  const clean = sanitizeGuideHtml(dirty);
  assert.doesNotMatch(clean, /script|onclick|onerror|style=|iframe|<img|javascript:/);
  assert.match(clean, /<section id="a"><h2>כותרת<\/h2>/);
  assert.match(clean, /<p class="note">/);
  assert.match(clean, /<a href="\/library\/page-proof">טוב<\/a>/);
  assert.match(clean, /<a href="https:\/\/otzaria.org\/x">חוץ<\/a>/);
  assert.doesNotMatch(clean, />רע</);
  // מזהה-פרק לא תקין — יורד; קישור "//" — יורד
  assert.equal(sanitizeGuideHtml('<section id="a b"><h2>x</h2></section>'), '<section><h2>x</h2></section>');
  assert.doesNotMatch(sanitizeGuideHtml('<p><a href="//evil.example">x</a></p>'), /<a/);
});

test('הקודים: איור ← מקום-שמור, כפתור ← הנוסח מהעורך, ערך ← מהאתר; קוד לא מוכר נשאר ומדווח', () => {
  const r = renderGuide('<section id="s"><h2>פרק</h2><p>[[כפתור:finish]] · [[ערך:שעות]] · [[ערך:עמודים]] · [[כפתור:nope]]</p>[[איור:שני-טורים]][[איור:אין]]</section>');
  assert.match(r.html, new RegExp(STAGE_TEXT.finish));
  assert.match(r.html, new RegExp(`${CLAIM_HOURS} · ${MAX_HELD}`));
  assert.match(r.html, /<span data-guide-figure="שני-טורים"><\/span>/);
  assert.deepEqual(r.unknown, ['[[כפתור:nope]]', '[[איור:אין]]']);
  assert.deepEqual(r.toc, [{ href: '#s', label: 'פרק' }]);
});

test('תוכן-הדף: מכל פרק עם id וכותרת — בלי שם האייקון', () => {
  const r = renderGuide(DEFAULT_GUIDE_HTML);
  assert.deepEqual(
    r.toc.map((t) => t.label),
    ['שלב 1: המבנה', 'שלב 2: הטקסט', 'קישורים', 'זמנים', 'שאלות']
  );
  assert.deepEqual(r.unknown, []);
  // כל האיורים בשימוש בנוסח המקורי
  for (const k of Object.keys(GUIDE_FIGURES)) assert.match(r.html, new RegExp(`data-guide-figure="${k}"`), k);
});

test('הנוסח המקורי: שמות הכפתורים מהעורך, מסגרת לריהוט, ונעול עד הזיהוי-מחדש', () => {
  const { html } = renderGuide(DEFAULT_GUIDE_HTML);
  for (const k of ['finish', 'finishRecut', 'finishAsk', 'skip', 'back']) assert.ok(html.includes(STAGE_TEXT[k]), k);
  assert.match(html, /גם להם מציירים מסגרת <b>"ריהוט הדף"<\/b>/);
  assert.match(html, /נעול עד שיזוהה/);
  assert.match(html, /בלי סימונים/);
  // הניקוי אינו משנה את הנוסח המקורי (חוץ מרווחים)
  assert.equal(sanitizeGuideHtml(DEFAULT_GUIDE_HTML).replace(/\s+/g, ' ').trim(), DEFAULT_GUIDE_HTML.replace(/\s+/g, ' ').trim());
});

test('קלט לשמירה: מחרוזת, לא ארוכה מדי, ועם לפחות כותרת-פרק אחת', () => {
  assert.match(guideInput(null).error, /חסר/);
  assert.match(guideInput('x'.repeat(MAX_GUIDE_HTML + 1)).error, /ארוך מדי/);
  assert.match(guideInput('<script>x</script>').error, /לא נשאר תוכן/);
  assert.match(guideInput('<p>בלי כותרת</p>').error, /כותרת-פרק/);
  assert.deepEqual(guideInput('<section id="a"><h2>א</h2><p>ב</p></section>'), { html: '<section id="a"><h2>א</h2><p>ב</p></section>' });
});

test('רשימת הקודים לעורך', () => {
  const c = guideCodes();
  assert.ok(c.figures.includes('[[איור:ריהוט]]'));
  assert.deepEqual(c.buttons.find((b) => b.code === '[[כפתור:finishAsk]]').text, STAGE_TEXT.finishAsk);
  assert.equal(c.values.find((v) => v.code === '[[ערך:שעות]]').text, String(CLAIM_HOURS));
});
