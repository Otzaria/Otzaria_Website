import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanBookName,
  escapeHtml,
  renderPluginChanges,
  buildStaleReminderHtml,
  formatPluginReportType,
} from './email-templates.js';

// ==================== cleanBookName ====================

test('cleanBookName: מסיר "- עמוד N" מהסוף', () => {
  assert.equal(cleanBookName('שם הספר - עמוד 5'), 'שם הספר');
});

test('cleanBookName: מסיר "/עמוד N"', () => {
  assert.equal(cleanBookName('שם_ספר/עמוד 12'), 'שם_ספר');
});

test('cleanBookName: מסיר "page N" באנגלית ולא תלוי-אותיות גדולות/קטנות', () => {
  assert.equal(cleanBookName('Some Book page 3'), 'Some Book');
});

test('cleanBookName: שם ללא מספר עמוד נשאר ללא שינוי', () => {
  assert.equal(cleanBookName('שם ספר רגיל'), 'שם ספר רגיל');
});

test('cleanBookName: קלט ריק/undefined מוחזר כמות שהוא', () => {
  assert.equal(cleanBookName(''), '');
  assert.equal(cleanBookName(undefined), undefined);
  assert.equal(cleanBookName(null), null);
});

// ==================== escapeHtml ====================

test('escapeHtml: בורח מכל תווי ה-HTML המסוכנים', () => {
  assert.equal(
    escapeHtml(`<script>alert('x') & "y"</script>`),
    '&lt;script&gt;alert(&#39;x&#39;) &amp; &quot;y&quot;&lt;/script&gt;'
  );
});

test('escapeHtml: null/undefined הופכים למחרוזת ריקה', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml: ממיר מספרים למחרוזת', () => {
  assert.equal(escapeHtml(42), '42');
});

// ==================== renderPluginChanges ====================

test('renderPluginChanges: מערך ריק/חסר מחזיר מחרוזת ריקה', () => {
  assert.equal(renderPluginChanges([]), '');
  assert.equal(renderPluginChanges(undefined), '');
});

test('renderPluginChanges: כולל את התוויות והערכים, בורח מתוכן זדוני', () => {
  const html = renderPluginChanges([
    { label: 'שם', before: '<b>old</b>', after: 'new' },
  ]);
  assert.match(html, /מה השתנה\?/);
  assert.match(html, /<strong>שם<\/strong>/);
  assert.match(html, /&lt;b&gt;old&lt;\/b&gt;/);
  assert.match(html, /new/);
});

test('renderPluginChanges: ברירת מחדל "ללא" כשאין before/after', () => {
  const html = renderPluginChanges([{ label: 'x' }]);
  assert.match(html, /לפני:<\/strong> ללא/);
  assert.match(html, /אחרי:<\/strong> ללא/);
});

// ==================== buildStaleReminderHtml ====================

test('buildStaleReminderHtml: מכניס כותרת, גוף, קישור CTA ולינק הסרה', () => {
  const html = buildStaleReminderHtml({
    headingTitle: 'כותרת <עם> תווים',
    bodyHtml: '<p>גוף</p>',
    ctaUrl: 'https://example.com/book',
    ctaLabel: 'לחץ כאן',
    unsubUrl: 'https://example.com/unsub',
  });
  // הכותרת עוברת escape
  assert.match(html, /כותרת &lt;עם&gt; תווים/);
  // גוף ה-HTML מוכנס כמות שהוא (הקוראת אחראית ל-escape מראש)
  assert.match(html, /<p>גוף<\/p>/);
  assert.match(html, /href="https:\/\/example\.com\/book"/);
  assert.match(html, /לחץ כאן/);
  assert.match(html, /href="https:\/\/example\.com\/unsub"/);
});

// ==================== formatPluginReportType ====================

test('formatPluginReportType: ממפה סוגים ידועים', () => {
  assert.equal(formatPluginReportType('bug'), 'תקלה');
  assert.equal(formatPluginReportType('crash'), 'קריסה');
  assert.equal(formatPluginReportType('content'), 'תוכן');
  assert.equal(formatPluginReportType('other'), 'אחר');
});

test('formatPluginReportType: סוג לא ידוע נופל ל-"אחר"', () => {
  assert.equal(formatPluginReportType('something-unknown'), 'אחר');
  assert.equal(formatPluginReportType(undefined), 'אחר');
});
