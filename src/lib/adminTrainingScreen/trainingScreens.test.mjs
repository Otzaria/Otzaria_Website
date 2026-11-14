import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  scriptLabel, statusLabel, statusTone, serializeParams, pageParam, linesCountText, pagesCountText, neighborAfterRemove,
} from './trainingTerms.js'
import {
  parseTrainingPagesQuery, serializeTrainingPagesQuery, updateTrainingPagesQuery, filterTrainingPages, trainingCounts,
  linesProgressText, linesDone, validateAddPage, paginate, workerOf, releaseText,
} from './trainingPagesQuery.js'
import {
  parseLinesQuery, serializeLinesQuery, linesUrl, appendLines, moveCount, lineTab, canApprove, canReturn, lineKeyAction, approveBlockReason,
} from './ocrLinesQuery.js'
import {
  parseLayoutQuery, serializeLayoutQuery, layoutUrl, activeFilters, taskSummary, importSummaryText, LAYOUT_KIND_LABELS as LABELS,
} from './ocrLayoutQuery.js'
import { proofTabItems, pendingTotal, approvedTotal, legacyTotal, PROOF_TABS } from './proofTabs.js'

describe('פוקוס אחרי הסרה', () => {
  it('הבא אחרי הראשון שיצא; אם אין — הקודם; אם לא נשאר כלום — null', () => {
    assert.equal(neighborAfterRemove(['a', 'b', 'c'], ['b']), 'c')
    assert.equal(neighborAfterRemove(['a', 'b', 'c'], ['c']), 'b')
    assert.equal(neighborAfterRemove(['a', 'b', 'c', 'd'], ['b', 'c']), 'd')
    assert.equal(neighborAfterRemove(['a', 'b', 'c'], ['b', 'c']), 'a')
    assert.equal(neighborAfterRemove(['a'], ['a']), null)
    assert.equal(neighborAfterRemove(['a'], ['x']), null)
  })
})

describe('trainingTerms', () => {
  it('שמות לפי המילון', () => {
    assert.equal(statusLabel('available'), 'פנוי')
    assert.equal(statusLabel('in-progress'), 'בעבודה')
    assert.equal(statusLabel('submitted'), 'ממתין לאישור')
    assert.equal(statusLabel('flagged'), 'דורש בדיקה')
    assert.equal(statusLabel('completed'), 'הושלם')
    assert.equal(statusLabel('???'), 'פנוי')
    assert.equal(statusTone('flagged'), 'error')
    assert.equal(scriptLabel('rashi'), 'רש״י')
    assert.equal(scriptLabel(undefined), 'מרובע')
  })
  it('כתובת בלי ערכי ברירת מחדל', () => {
    assert.equal(serializeParams([['tab', 'submitted', 'submitted'], ['pool', 'all', 'all']]), '')
    assert.equal(serializeParams([['tab', 'approved', 'submitted'], ['page', 2, 1]]), '?tab=approved&page=2')
  })
  it('מספר עמוד וספירות', () => {
    assert.equal(pageParam('3'), 3)
    assert.equal(pageParam('-1'), 1)
    assert.equal(pageParam('abc'), 1)
    assert.equal(linesCountText(1), 'שורה אחת')
    assert.equal(linesCountText(1200), '1,200 שורות')
    assert.equal(pagesCountText(1), 'עמוד אחד')
    assert.equal(pagesCountText(5), '5 עמודים')
  })
})

describe('עמודים לאימון', () => {
  const pages = [
    { id: 'a', scriptType: 'square', status: 'available', filledLines: 0, targetLines: 10 },
    { id: 'b', scriptType: 'rashi', status: 'completed', filledLines: 10, targetLines: 10 },
    { id: 'c', scriptType: 'rashi', status: 'in-progress', filledLines: 4, targetLines: 10 },
    { id: 'd', status: 'weird', filledLines: 2, targetLines: 10 },
  ]
  it('כתובת: קריאה וכתיבה, ערכים לא מוכרים נזרקים', () => {
    const q = parseTrainingPagesQuery(new URLSearchParams('script=rashi&status=completed&page=2'))
    assert.deepEqual(q, { script: 'rashi', status: 'completed', page: 2 })
    assert.equal(serializeTrainingPagesQuery(q), '?script=rashi&status=completed&page=2')
    assert.deepEqual(parseTrainingPagesQuery({ script: 'x', status: 'y' }), { script: '', status: '', page: 1 })
    assert.equal(serializeTrainingPagesQuery({ script: '', status: '', page: 1 }), '')
  })
  it('שינוי סינון מחזיר לעמוד הראשון', () => {
    assert.equal(updateTrainingPagesQuery({ script: '', status: '', page: 3 }, { script: 'rashi' }).page, 1)
    assert.equal(updateTrainingPagesQuery({ script: '', status: '', page: 3 }, { page: 2 }).page, 2)
  })
  it('סינון לפי כתב ומצב (בלי כתב — מרובע, מצב לא מוכר — פנוי)', () => {
    assert.deepEqual(filterTrainingPages(pages, { script: 'rashi', status: '' }).map((p) => p.id), ['b', 'c'])
    assert.deepEqual(filterTrainingPages(pages, { script: 'square', status: 'available' }).map((p) => p.id), ['a', 'd'])
    assert.equal(paginate(pages, 1).total, 4)
  })
  it('מונים לפי כתב ומצב', () => {
    const c = trainingCounts(pages)
    assert.equal(c.total, 4)
    assert.equal(c.filledLines, 16)
    assert.deepEqual(c.byScript.rashi, { total: 2, available: 0, 'in-progress': 1, completed: 1 })
    assert.equal(c.byScript.square.available, 2)
  })
  it('התקדמות שורות', () => {
    assert.equal(linesProgressText(pages[2]), '4 מתוך 10')
    assert.equal(linesDone(pages[1]), true)
    assert.equal(linesDone({ filledLines: 0, targetLines: 0 }), false)
  })
  it('בדיקת הטופס', () => {
    assert.match(validateAddPage({ book: null, pageNumber: '3' }).error, /בחר ספר/)
    assert.match(validateAddPage({ book: { id: 'x' }, pageNumber: '0' }).error, /מספר עמוד/)
    assert.match(validateAddPage({ book: { id: 'x' }, pageNumber: '2.5' }).error, /מספר עמוד/)
    assert.match(validateAddPage({ book: { id: 'x', totalPages: 10 }, pageNumber: '11' }).error, /10 עמודים בלבד/)
    assert.deepEqual(validateAddPage({ book: { id: 'x', totalPages: 10 }, pageNumber: ' 7 ' }), { body: { bookId: 'x', pageNumber: 7 } })
  })
})

describe('עמודים לאימון — מתנדב ושחרור', () => {
  it('"בעבודה אצל" רק בעבודה; בעמוד שהושלם — "הושלם בידי"', () => {
    assert.deepEqual(workerOf({ status: 'in-progress', claimedByName: 'משה' }), { label: 'בעבודה אצל', name: 'משה' })
    assert.deepEqual(workerOf({ status: 'completed', claimedByName: 'משה' }), { label: 'הושלם בידי', name: 'משה' })
    assert.equal(workerOf({ status: 'available', claimedByName: 'משה' }), null)
    assert.equal(workerOf({ status: 'in-progress' }), null)
  })
  it('שחרור עמוד שהושלם — יוצא מהורדת ההושלמו', () => {
    assert.match(releaseText({ status: 'completed', claimedByName: 'משה' }), /לא ייכלל בהורדת השורות מעמודים שהושלמו/)
    assert.match(releaseText({ status: 'in-progress', claimedByName: 'משה' }), /^משה כבר לא יוכל להמשיך/)
  })
})

describe('תמלול שורות', () => {
  it('למה אי אפשר לאשר', () => {
    assert.equal(approveBlockReason({ status: 'submitted' }), null)
    assert.match(approveBlockReason({ status: 'submitted', suggestedScriptType: 'rashi' }), /קבל או דחה/)
    assert.match(approveBlockReason({ status: 'approved' }), /רק שורה שממתינה לאישור/)
  })

  it('כתובת ובקשה זהה למסך הקודם', () => {
    const q = parseLinesQuery(new URLSearchParams('tab=flagged&pool=legacy'))
    assert.deepEqual(q, { tab: 'flagged', pool: 'legacy' })
    assert.equal(serializeLinesQuery(q), '?tab=flagged&pool=legacy')
    assert.equal(serializeLinesQuery(parseLinesQuery(new URLSearchParams('tab=zzz'))), '')
    assert.equal(linesUrl({ tab: 'submitted', pool: 'all' }, 50), '/api/admin/ocr-lines?status=submitted&skip=50&pool=all')
  })
  it('"טען עוד" בלי כפולות', () => {
    assert.deepEqual(appendLines([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).map((l) => l.id), [1, 2, 3])
  })
  it('מונים אחרי פעולה', () => {
    assert.deepEqual(moveCount({ submitted: 2, approved: 0 }, 'submitted', 'approved'), { submitted: 1, approved: 1 })
    assert.deepEqual(moveCount({ submitted: 0 }, 'submitted', null), { submitted: 0 })
  })
  it('לשונית, אישור והחזרה', () => {
    assert.equal(lineTab({ status: 'available', flagged: 'unreadable' }), 'flagged')
    assert.equal(lineTab({ status: 'approved' }), 'approved')
    assert.equal(canApprove({ status: 'submitted' }), true)
    assert.equal(canApprove({ status: 'submitted', suggestedScriptType: 'rashi' }), false)
    assert.equal(canApprove({ status: 'approved' }), false)
    assert.equal(canReturn({ status: 'available' }), false)
    assert.equal(canReturn({ status: 'approved' }), true)
  })
  it('מקשים', () => {
    assert.equal(lineKeyAction({ code: 'KeyJ' }), 'next')
    assert.equal(lineKeyAction({ key: 'ArrowUp' }), 'prev')
    assert.equal(lineKeyAction({ code: 'KeyA' }), 'approve')
    assert.equal(lineKeyAction({ code: 'KeyA', ctrlKey: true }), null)
    assert.equal(lineKeyAction({ code: 'KeyR' }), 'return')
    assert.equal(lineKeyAction({ code: 'KeyX' }), null)
  })
})

describe('תיוג מבנה', () => {
  it('כתובת ובקשה באותו סדר כמו קודם', () => {
    const q = parseLayoutQuery(new URLSearchParams('tab=approved&batch=b1&kind=header&edition=e'))
    assert.deepEqual(q, { tab: 'approved', batch: 'b1', edition: 'e', kind: 'header' })
    assert.equal(serializeLayoutQuery(q), '?tab=approved&batch=b1&edition=e&kind=header')
    assert.equal(layoutUrl(q, 30), '/api/admin/ocr-layout?status=approved&skip=30&batch=b1&edition=e&kind=header')
    assert.equal(layoutUrl({ tab: 'submitted', batch: '', edition: '', kind: '' }), '/api/admin/ocr-layout?status=submitted&skip=0')
    assert.equal(parseLayoutQuery({ kind: 'nope' }).kind, '')
    assert.equal(activeFilters(q), 3)
  })
  it('תקציר תשובות', () => {
    assert.equal(taskSummary({ kind: 'pagenum' }, LABELS), 'מספר עמוד: עוד לא סומן')
    assert.equal(taskSummary({ kind: 'pagenum', answer: { value: null } }, LABELS), 'מספר עמוד: אין מספר')
    assert.equal(taskSummary({ kind: 'header', answer: { box: [1, 2, 3, 4] }, confirmed: true }, LABELS), 'כותרת רצה: סומנה · ההצעה של המכונה אושרה')
    assert.equal(taskSummary({ kind: 'streams', answer: { bands: [1, 2] } }, LABELS), 'חלוקה לטורים: 2 טורים')
    assert.equal(
      taskSummary({ kind: 'zones-full', answer: { pagenum: { value: 12 }, header: { box: null }, streams: { bands: [1] } } }, LABELS),
      'עמוד מלא: 12 · אין כותרת · טור אחד'
    )
  })
  it('סיכום ייבוא', () => {
    const t = importSummaryText({ pages: 10, created: 7, updated: 3, skippedAnswered: 2, byKind: { header: 4, pagenum: 0 }, errors: ['a', 'b', 'c', 'd', 'e', 'f'] }, LABELS)
    assert.deepEqual(t.lines, ['נקלטו 10 עמודים: 7 חדשים, 3 עודכנו.', '2 דולגו, כי כבר סומנו.', 'לפי סוג: כותרת רצה — 4'])
    assert.equal(t.errors.length, 5)
    assert.deepEqual(importSummaryText(null), { lines: [], errors: [] })
  })
})

describe('הגהה', () => {
  const summary = {
    sections: { ocr: { submitted: 12, approved: 3 }, router: { submitted: 4, approved: 1 }, frames: { submitted: 2, approved: 0 } },
    requests: 2,
  }
  it('שמות הלשוניות לפי המילון, מזהים כמו קודם', () => {
    assert.deepEqual(PROOF_TABS.map((t) => t.id), ['review', 'upload', 'export', 'volunteers', 'guide', 'legacy'])
    assert.deepEqual(PROOF_TABS.map((t) => t.label), ['לאישור', 'העלאה', 'הורדות', 'מתנדבים', 'הנחיות', 'ניקוי נתונים ישנים'])
  })
  it('מונים', () => {
    assert.equal(pendingTotal(summary), 18)
    assert.equal(approvedTotal(summary), 4)
    assert.equal(pendingTotal(null), 0)
    const items = proofTabItems(summary)
    assert.equal(items[0].count, 18)
    assert.equal(items[3].count, 2)
    assert.equal(items[3].countLabel, '2 בקשות גישה')
    assert.equal(proofTabItems({ sections: summary.sections, requests: 0 })[3].count, undefined)
    // יחיד
    const one = proofTabItems({ sections: { ocr: { submitted: 1 } }, requests: 1 })
    assert.equal(one[0].countLabel, 'אחד ממתין לאישור')
    assert.equal(one[3].countLabel, 'בקשת גישה אחת')
  })
  it('ניקוי נתונים ישנים — מוסתרת כשאין נתונים, חוץ מכשהיא הפתוחה', () => {
    assert.equal(legacyTotal({ counts: { books: 1, pages: 2, submissions: 0, drafts: 0 }, files: 4 }), 7)
    assert.equal(legacyTotal({ success: false }), null)
    assert.equal(proofTabItems(summary, { hideLegacy: true }).some((t) => t.id === 'legacy'), false)
    assert.equal(proofTabItems(summary, { hideLegacy: true, active: 'legacy' }).some((t) => t.id === 'legacy'), true)
  })
})
