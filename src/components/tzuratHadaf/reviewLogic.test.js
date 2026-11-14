import { describe, it, expect } from 'vitest'
import { fracBoxFromPoints, fracBoxOk, regionOf, regionsOf, reportBody, validateReport } from './reportLogic'
import { missingChecks, stageFromDraft, submitBody, workFromDraft, workSummary } from './reviewState'
import { centerFraction, clampPaneZoom, lineBoxes, paneZoomStep, pctStyle, scrollForFraction } from './paneGeometry'
import { heldSplit, pageAction, pickSlug, stateCounts } from './gridLogic'
import { expectedText, guideSuggestions, practiceAnswers, resultsById } from './practiceLogic'
import { fixtureItem, fixtureModel } from './testFixtures'
import { pct } from './labels'

describe('reportLogic', () => {
  it('validateReport: סוג חובה, טקסט חובה ב"אחר", טקסט או מלבן', () => {
    expect(validateReport({ category: '', text: 'x', regions: [] })).toMatch(/סוג/)
    expect(validateReport({ category: 'other', text: ' ', regions: [{ side: 'scan', x: 0, y: 0, w: 0.1, h: 0.1 }] })).toMatch(/אחר/)
    expect(validateReport({ category: 'missing', text: '', regions: [] })).toMatch(/כתבו/)
    expect(validateReport({ category: 'missing', text: '', regions: [{ side: 'scan', x: 0, y: 0, w: 0.1, h: 0.1 }] })).toBeNull()
    expect(validateReport({ category: 'header', text: 'הכותרת נמוכה', regions: [] })).toBeNull()
    expect(validateReport({ category: 'header', text: 'x', regions: [{ side: 'left', x: 0, y: 0, w: 0.1, h: 0.1 }] })).toMatch(/מלבן/)
  })
  it('fracBoxFromPoints — מנורמל, בשברים, וקטן מדי — null', () => {
    expect(fracBoxFromPoints([500, 300], [100, 100], 1000, 1000)).toEqual({ x: 0.1, y: 0.1, w: 0.4, h: 0.2 })
    expect(fracBoxFromPoints([0, 0], [3, 3], 1000, 1000)).toBeNull()
    expect(fracBoxFromPoints([-50, -50], [100, 2000], 1000, 1000)).toEqual({ x: 0, y: 0, w: 0.1, h: 1 })
    expect(fracBoxOk({ x: 0.9, y: 0, w: 0.2, h: 0.1 })).toBe(false)
  })
  it('regionsOf / regionOf / reportBody', () => {
    const regions = regionsOf({ scan: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, ours: null })
    expect(regions).toEqual([{ side: 'scan', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }])
    expect(regionOf(regions, 'scan')).toEqual({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 })
    expect(regionOf(regions, 'ours')).toBeNull()
    expect(reportBody({ category: 'size', text: ' גדול ', regions, extra: 1 })).toEqual({ category: 'size', text: 'גדול', regions })
  })
})

describe('reviewState', () => {
  const model = fixtureModel()
  it('workFromDraft מסנן חלקים פגומים; stageFromDraft', () => {
    const w = workFromDraft({
      checks: { blocks: 'ok', headers: 'maybe' },
      lineOps: [{ op: 'confirm', block: 'g', line: 1 }],
      itemAnswers: { a: { choice: 'b' }, b: { choice: 'other', text: '' } },
      manualItems: [{ ref: 'r', text: 'x' }, 7],
      reports: [{ category: 'other', text: '' }, { category: 'size', text: 'גדול', regions: [] }],
      note: 'הערה',
    })
    expect(w.checks).toEqual({ blocks: 'ok' })
    expect(w.lineOps).toHaveLength(1)
    expect(Object.keys(w.itemAnswers)).toEqual(['a'])
    expect(w.manualItems).toHaveLength(1)
    expect(w.reports).toHaveLength(1)
    expect(w.note).toBe('הערה')
    expect(workFromDraft({ lineOps: 'x' }).lineOps).toEqual([])
    expect(stageFromDraft({ stage: 'lines' })).toBe('lines')
    expect(stageFromDraft({ stage: 'zzz' })).toBe('overview')
    expect(stageFromDraft(null)).toBe('overview')
  })
  it('submitBody — לפי CONTRACT', () => {
    const body = submitBody({
      checks: { blocks: 'ok', size: 'issue' },
      lineOps: [{ op: 'confirm', block: 'g', line: 1 }],
      itemAnswers: { i1: { choice: 'a' }, i2: { choice: 'other', text: ' אמר ' }, i3: null },
      manualItems: [{ block: 'g', line: 1, ref: 'r', wi: 4, n: 1, otz: ['בערבין'], text: ' בערבית ', box: null, junk: 1 }],
      reports: [{ category: 'size', text: 'x', regions: [] }],
      note: '  שלום  ',
    })
    expect(body).toEqual({
      checks: { blocks: 'ok', size: 'issue' },
      lineOps: [{ op: 'confirm', block: 'g', line: 1 }],
      itemAnswers: [
        { item: 'i1', choice: 'a' },
        { item: 'i2', choice: 'other', text: 'אמר' },
      ],
      manualItems: [{ block: 'g', line: 1, ref: 'r', wi: 4, n: 1, otz: ['בערבין'], text: 'בערבית', box: null }],
      reports: [{ category: 'size', text: 'x', regions: [] }],
      note: 'שלום',
    })
  })
  it('submitBody — round רק כשניתן', () => {
    const w = { checks: {}, lineOps: [], itemAnswers: {}, manualItems: [], reports: [], note: '' }
    expect(submitBody(w, { round: 3 }).round).toBe(3)
    expect('round' in submitBody(w)).toBe(false)
  })
  it('workSummary ו-missingChecks', () => {
    const items = [fixtureItem({ id: 'i1' }), fixtureItem({ id: 'i2' })]
    const s = workSummary(
      model,
      { checks: { blocks: 'issue' }, lineOps: [{ op: 'confirm', block: 'g', line: 1 }], itemAnswers: { i1: { choice: 'a' }, zz: { choice: 'a' } }, manualItems: [], reports: [{}] },
      items
    )
    expect(s).toMatchObject({ checksDone: 1, checksTotal: 4, issues: 1, moved: 0, confirmed: 1, answered: 1, items: 2, manual: 0, reports: 1 })
    expect(missingChecks({ blocks: 'ok' })).toEqual(['headers', 'edges', 'size'])
  })
})

describe('paneGeometry', () => {
  it('זום בגבולות', () => {
    expect(paneZoomStep(1, 1)).toBe(1.25)
    expect(paneZoomStep(0.5, -1)).toBe(0.5)
    expect(clampPaneZoom(100)).toBe(6)
    expect(clampPaneZoom('x')).toBe(1)
  })
  it('גלילה מסונכרנת במרחב השברים', () => {
    const a = { scrollLeft: 0, scrollTop: 450, clientWidth: 400, clientHeight: 100, scrollWidth: 400, scrollHeight: 1000 }
    const f = centerFraction(a)
    expect(f.y).toBeCloseTo(0.5)
    const b = { clientWidth: 400, clientHeight: 100, scrollWidth: 400, scrollHeight: 2000 }
    expect(scrollForFraction(f, b)).toEqual({ left: 0, top: 950 })
    expect(scrollForFraction({ x: 0, y: 1 }, b).top).toBe(1900)
  })
  it('תיבות השורות לצד אחד, בלי שורות בלי רישום', () => {
    const scan = lineBoxes(fixtureModel(), 'scan')
    const ours = lineBoxes(fixtureModel(), 'ours')
    expect(scan.map((b) => b.key)).toEqual(['g:0', 'g:1', 'r:0'])
    expect(ours).toHaveLength(4)
    expect(pctStyle([0.1, 0.2, 0.3, 0.4])).toEqual({ left: '10%', top: '20%', width: '30%', height: '40%' })
    expect(pctStyle([0, 0, 0, 1])).toBeNull()
  })
})

describe('gridLogic', () => {
  it('pageAction לפי מצב והמקסימום', () => {
    expect(pageAction('open', 0, 5)).toMatchObject({ kind: 'claim', disabled: false })
    expect(pageAction('open', 5, 5)).toMatchObject({ kind: 'claim', disabled: true })
    expect(pageAction('mine')).toMatchObject({ kind: 'resume' })
    expect(pageAction('taken')).toMatchObject({ kind: 'none' })
    expect(pageAction('submitted')).toMatchObject({ kind: 'view' })
    expect(pageAction('closed')).toMatchObject({ kind: 'none' })
  })
  it('stateCounts, heldSplit, pickSlug', () => {
    const pages = [
      { id: '1', state: 'open' },
      { id: '2', state: 'mine' },
      { id: '3', state: 'open' },
    ]
    expect(stateCounts(pages)).toEqual([
      { state: 'open', count: 2 },
      { state: 'mine', count: 1 },
    ])
    expect(heldSplit(pages, ['2', '9'])).toEqual({ here: [pages[1]], elsewhere: ['9'] })
    const books = [
      { slug: 'shabbat', order: 2 },
      { slug: 'berakhot', order: 1 },
    ]
    expect(pickSlug(books, 'shabbat')).toBe('shabbat')
    expect(pickSlug(books, 'nope')).toBe('berakhot')
    expect(pickSlug([], null)).toBeNull()
    expect(pct(1, 3)).toBe(33)
    expect(pct(1, 0)).toBe(0)
  })
})

describe('practiceLogic', () => {
  const items = [fixtureItem({ id: 'p1' }), fixtureItem({ id: 'p2', kind: 'r' }), fixtureItem({ id: 'p3' }), fixtureItem({ id: 'p4' }), fixtureItem({ id: 'p5' })]
  it('התשובות לשליחה — רק המוכנות', () => {
    expect(practiceAnswers(items, { p1: { choice: 'a' }, p2: { choice: 'other', text: '' }, p3: { choice: 'other', text: 'x' } })).toEqual([
      { id: 'p1', choice: 'a' },
      { id: 'p3', choice: 'other', text: 'x' },
    ])
  })
  it('התוצאות לכרטיסים והתשובה הנכונה במילים', () => {
    expect(expectedText(items[0], 'b')).toBe('א"ר')
    expect(expectedText(items[0], 'unclear')).toMatch(/לא ברור/)
    expect(resultsById(items, [{ id: 'p1', correct: false, expected: 'a', explain: 'כך' }]).p1).toEqual({ correct: false, expectedText: 'אמר רבי', explain: 'כך' })
  })
  it('יותר משלוש טעויות — פרקים בהנחיות (כולל כתב רש"י)', () => {
    const wrong = items.map((it) => ({ id: it.id, correct: false }))
    expect(guideSuggestions(items, wrong.slice(0, 3))).toEqual([])
    const s = guideSuggestions(items, wrong)
    expect(s).toEqual(expect.arrayContaining(['fast', 'print-decides', 'rashi-script']))
  })
})
