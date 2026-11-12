import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditSource, baseClass, classifyClass, extractStrings, findException, summarize } from './tokenAudit.js'

test('classifyClass: צבע Tailwind גולמי', () => {
  for (const cls of ['bg-gray-100', 'text-white', 'border-red-500/40', 'hover:bg-slate-50', 'border-x-blue-200', 'ring-black/10']) {
    assert.equal(classifyClass(cls), 'raw-color', cls)
  }
})

test('classifyClass: שם מיושן ורמפת מורשת', () => {
  for (const cls of ['text-accent', 'bg-primary-container', 'border-surface-variant', 'text-on-background', 'bg-neutral-100', 'text-danger-700', 'bg-neutral-cool-50', 'text-foreground']) {
    assert.equal(classifyClass(cls), 'legacy-color', cls)
  }
})

test('classifyClass: טוקן תקין — לא ממצא (כולל שמות שמכילים שם מיושן)', () => {
  for (const cls of ['text-on-surface-variant', 'bg-surface-container-high', 'text-on-secondary-container', 'bg-primary', 'text-body-sm', 'rounded-(--radius-control)', 'rounded-full', 'shadow-menu', 'font-medium', 'max-w-[var(--x)]', 'text-title-md', 'flex', '']) {
    assert.equal(classifyClass(cls), null, cls)
  }
})

test('classifyClass: סולם ישן', () => {
  for (const cls of ['text-sm', 'md:text-xs', 'text-2xl', 'rounded-lg', 'rounded-t-xl', 'shadow-lg', 'font-bold', '!font-bold']) {
    assert.equal(classifyClass(cls), 'old-scale', cls)
  }
})

test('classifyClass: ערך בסוגריים (לא var)', () => {
  assert.equal(classifyClass('max-w-[380px]'), 'arbitrary')
  assert.equal(classifyClass('rounded-[4px]'), 'arbitrary')
  assert.equal(classifyClass('data-[open]:w-[18rem]'), 'arbitrary')
  assert.equal(classifyClass('w-[calc(100%-var(--x))]'), null)
  assert.equal(classifyClass('[mask:none]'), null)
  assert.equal(classifyClass('items[0]'), null)
})

test('baseClass: מוריד וריאנטים, גם עם נקודתיים בתוך סוגריים', () => {
  assert.equal(baseClass('md:hover:bg-gray-50'), 'bg-gray-50')
  assert.equal(baseClass('[&:hover]:text-sm'), 'text-sm')
  assert.equal(baseClass('-mt-2'), 'mt-2')
})

test('extractStrings: מדלג על הערות, שומר מספר שורה, לא חוצה שורה בטקסט עם גרש', () => {
  const src = [
    "// 'text-sm' בהערה",
    '/* "bg-gray-100" */',
    'const a = "rounded-lg"',
    '<span>ק"ב</span>',
    "const b = `p-2",
    "  font-bold`",
  ].join('\n')
  const strings = extractStrings(src)
  assert.deepEqual(strings.map((s) => s.line), [3, 4, 5])
  assert.equal(strings[0].text, 'rounded-lg')
})

test('auditSource: ממצאים עם שורה, רק ממחרוזות', () => {
  const src = [
    "import x from './x'",
    "const shadow = 1 // text-sm",
    "<div className=\"p-2 text-sm bg-gray-100\" style={{ color: '#fff' }} />",
    "const c = cx('rounded-(--radius-control)', open && 'max-w-[500px]')",
    "const s = 'rgb(0 0 0)'",
  ].join('\n')
  assert.deepEqual(auditSource(src), [
    { category: 'old-scale', token: 'text-sm', line: 3 },
    { category: 'raw-color', token: 'bg-gray-100', line: 3 },
    { category: 'hex', token: '#fff', line: 3 },
    { category: 'arbitrary', token: 'max-w-[500px]', line: 4 },
    { category: 'hex', token: 'rgb(', line: 5 },
  ])
  assert.deepEqual(auditSource(''), [])
})

test('findException: קובץ, תיקייה, וקטגוריות', () => {
  const exceptions = [
    { path: 'src/a/Region.jsx', reason: 'DOM', categories: ['old-scale'] },
    { path: 'src/proof/', reason: 'שלב נפרד' },
  ]
  assert.equal(findException('src/a/Region.jsx', 'old-scale', exceptions)?.reason, 'DOM')
  assert.equal(findException('src/a/Region.jsx', 'raw-color', exceptions), null)
  assert.equal(findException('src/proof/x/y.jsx', 'hex', exceptions)?.reason, 'שלב נפרד')
  assert.equal(findException('src/proofing.jsx', 'hex', exceptions), null)
})

test('summarize: סופר לפי קטגוריה וקובץ, ומפריד חריגות', () => {
  const results = [
    { file: 'a.jsx', findings: [{ category: 'old-scale' }, { category: 'raw-color' }] },
    { file: 'b.jsx', findings: [{ category: 'old-scale' }] },
    { file: 'skip/c.jsx', findings: [{ category: 'hex' }, { category: 'hex' }] },
  ]
  const s = summarize(results, [{ path: 'skip/', reason: 'x' }])
  assert.equal(s.total, 3)
  assert.equal(s.excused, 2)
  assert.equal(s.byCategory['old-scale'], 2)
  assert.equal(s.excusedByCategory.hex, 2)
  assert.deepEqual(s.files, [{ file: 'a.jsx', count: 2 }, { file: 'b.jsx', count: 1 }])
})

test('classifyClass: ערכים בסוגריים שמותרים לפי ARBITRARY_RULES', () => {
  for (const cls of [
    'grid-cols-[2.5rem_minmax(0,1fr)_auto]', '@4xl:grid-rows-[auto_1fr]',
    'transition-[width]', 'transition-[inset-inline-start]',
    'forced-colors:border-[CanvasText]', 'forced-colors:after:bg-[Highlight]',
    'pb-[max(1rem,env(safe-area-inset-bottom))]', 'max-h-[92dvh]', 'sm:max-h-[min(85dvh,46rem)]', 'pt-[12dvh]',
    'max-w-[60%]', 'start-[calc(100%-1.125rem)]', 'h-[1em]', 'text-[1.15em]', 'my-[calc((1lh-1em)/2)]',
  ]) {
    assert.equal(classifyClass(cls), null, cls)
  }
})

test('classifyClass: rem/px בסוגריים — עדיין ממצא (rem אינו em)', () => {
  for (const cls of ['h-[5.5rem]', 'text-[1.25rem]', 'before:w-[3px]', 'min-w-[44rem]', 'transition-[200ms]', 'border-[#fff]']) {
    assert.equal(classifyClass(cls), 'arbitrary', cls)
  }
})

test('findException: tokens — חריגה נקודתית למחלקה מסוימת בלבד', () => {
  const exceptions = [{ path: 'src/a/Nav.jsx', reason: 'עובי סמן', categories: ['arbitrary'], tokens: ['before:w-[3px]'] }]
  assert.equal(findException('src/a/Nav.jsx', { category: 'arbitrary', token: 'before:w-[3px]' }, exceptions)?.reason, 'עובי סמן')
  assert.equal(findException('src/a/Nav.jsx', { category: 'arbitrary', token: 'w-[4px]' }, exceptions), null)
  assert.equal(findException('src/a/Nav.jsx', 'arbitrary', exceptions), null)
})
