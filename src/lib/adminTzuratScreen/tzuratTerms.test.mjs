// "צורת הדף" — ניסוח המצבים, חישובי לשונית "מצב", הסה"כ ברשימה וההורדות (tzuratTerms.js).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  statusLabel, statusTone, statusOptions, percentOf, sortBooks, bookOptions, countRows, mergeByLabel, volunteersText,
  totalText, totalAfterChange, roundText, submissionCountsText, importSummaryParts, EXPORT_TYPES, exportUrl, exportFileName, sizeText,
} from './tzuratTerms.js'
import { LRI, PDI } from '../adminList/fileSize.js'

const API = '/api/admin/tzurat-hadaf'

describe('מצבים', () => {
  it('שם וגוון לפי סוג; לא מוכר — הערך עצמו וגוון ניטרלי', () => {
    assert.equal(statusLabel('submission', 'submitted'), 'ממתין לאישור')
    assert.equal(statusTone('submission', 'submitted'), 'warning')
    assert.equal(statusLabel('item', 'flagged'), 'דורש בדיקה')
    assert.equal(statusTone('upload', 'failed'), 'error')
    assert.equal(statusLabel('batch', 'paused'), 'מושהה')
    assert.equal(statusLabel('report', 'weird'), 'weird')
    assert.equal(statusTone('report', 'weird'), 'neutral')
    assert.equal(statusLabel('nope', undefined), '—')
  })
  it('אפשרויות לבורר — לפי הסדר שנקבע', () => {
    assert.deepEqual(statusOptions('submission', ['submitted', 'approved']), [
      { value: 'submitted', label: 'ממתין לאישור' },
      { value: 'approved', label: 'מאושר' },
    ])
    assert.equal(statusOptions('report').length, 5)
  })
})

describe('לשונית "מצב"', () => {
  it('אחוז שלם בגבולות 0–100', () => {
    assert.equal(percentOf(1, 3), 33)
    assert.equal(percentOf(5, 0), 0)
    assert.equal(percentOf(9, 3), 100)
  })
  it('מסכתות לפי order; בורר מסכת מ-batches', () => {
    assert.deepEqual(sortBooks([{ slug: 'b', order: 2 }, { slug: 'a', order: 1 }]).map((b) => b.slug), ['a', 'b'])
    assert.deepEqual(bookOptions({ batches: [{ slug: 'shabbat', masechet: 'שבת', order: 2 }, { slug: 'x', order: 1 }] }), [
      { value: 'x', label: 'x' },
      { value: 'shabbat', label: 'שבת' },
    ])
    assert.deepEqual(bookOptions(null), [])
  })
  it('שורות פילוח: לפי הסדר, ואחר כך השאר, עם אחוז מהסה"כ', () => {
    const rows = countRows({ open: 1, disputed: 3, other: 4 }, (k) => k.toUpperCase(), ['disputed', 'open', 'agreed'])
    assert.deepEqual(rows.map((r) => r.key), ['disputed', 'open', 'other'])
    assert.equal(rows[0].label, 'DISPUTED')
    assert.equal(rows[2].percent, 50)
    assert.deepEqual(countRows(undefined), [])
  })
  it('מיזוג סוגים שחולקים שם', () => {
    assert.deepEqual(mergeByLabel({ g: 2, mg: 1, mg2: 3 }, (k) => (k.startsWith('mg') ? 'שוליים' : k)), { g: 2, 'שוליים': 4 })
  })
  it('מתנדבים — יחיד ורבים', () => {
    assert.equal(volunteersText({ total: 42, active7d: 1 }), '42 מתנדבים · פעיל אחד בשבוע האחרון')
    assert.equal(volunteersText(undefined), '0 מתנדבים · 0 פעילים בשבוע האחרון')
    assert.equal(totalText(1, 'הגשה אחת', 'הגשות'), 'הגשה אחת')
    assert.equal(totalText(1200, 'הגשה אחת', 'הגשות'), '1,200 הגשות')
  })
})

describe('הורדות', () => {
  it('הכול — בלי פרמטרים; חלק — types ו-parts; מאז — ISO', () => {
    const all = EXPORT_TYPES.map(([k]) => k)
    assert.equal(exportUrl(API, '', all), `${API}/export`)
    assert.equal(exportUrl(API, '', ['reports']), `${API}/export?types=reports&parts=reports`)
    const since = exportUrl(API, '2026-10-01', all)
    assert.match(since, /^\/api\/admin\/tzurat-hadaf\/export\?since=2026-(09-30|10-01)T/)
    assert.equal(exportUrl(API, 'not-a-date', all), `${API}/export`)
  })
  it('שם הקובץ וגודל', () => {
    assert.equal(exportFileName('2026-11-06', ''), 'tzurat-hadaf-export-2026-11-06.ndjson')
    assert.equal(exportFileName('2026-11-06', '2026-10-01'), 'tzurat-hadaf-export-2026-11-06-since-2026-10-01.ndjson')
    assert.equal(sizeText(2048), `${LRI}2 KB${PDI}`)
  })
})

describe('הסה"כ ברשימה אחרי שינוי מקומי', () => {
  it('יצא מהמצב שבסינון — פחות 1; חזר אליו — ועוד 1; "הכול" — בלי שינוי', () => {
    assert.equal(totalAfterChange(3, 'submitted', 'submitted', 'approved'), 2)
    assert.equal(totalAfterChange(2, 'disputed', 'resolved', 'disputed'), 3)
    assert.equal(totalAfterChange(3, 'all', 'new', 'fixed'), 3)
    assert.equal(totalAfterChange(0, 'new', 'new', 'fixed'), 0)
    assert.equal(totalAfterChange(3, 'new', 'in_progress', 'fixed'), 3)
    assert.equal(totalAfterChange(undefined, 'new', 'new', 'fixed'), undefined)
  })
  it('העלאה שהסתיימה — "הושלם" לפי המילון', () => {
    assert.equal(statusLabel('upload', 'done'), 'הושלם')
  })
})

describe('ניסוח: בדיקה, תוכן הגשה, סיכום ייבוא', () => {
  it('roundText — בלי "סבב"', () => {
    assert.equal(roundText(1), 'בדיקה ראשונה')
    assert.equal(roundText(undefined), 'בדיקה ראשונה')
    assert.equal(roundText(2), 'בדיקה שנייה')
    assert.equal(roundText(5), 'בדיקה מס׳ 5')
  })
  it('submissionCountsText — יחיד בעברית, בלי אפסים', () => {
    assert.equal(submissionCountsText({ anchors: 6, items: 3, manual: 1, reports: 0 }), '6 סימוני שורות · 3 החלטות · תיקון ידני אחד')
    assert.equal(submissionCountsText({}), 'בלי סימונים')
  })
  it('importSummaryParts — בלי slug/buildId, בלי אפסים, בלי שמות באנגלית', () => {
    const parts = importSummaryParts({
      slug: 'berakhot', masechet: 'ברכות', buildId: 'build-1', full: false,
      pages: { created: 12, updated: 3, reopened: 0 },
      items: { created: 412, updated: 0, revived: 1, skippedAnswered: 5, obsoleted: 0, keptAnswered: 2 },
      practice: 0, images: 30, ignored: 0, errors: 0,
    })
    assert.deepEqual(parts, [
      'ברכות',
      'עמודים: 12 חדשים, 3 עודכנו',
      'החלטות: 412 חדשות, אחת חזרה לפעילות, 5 שכבר נענו לא נדרסו, 2 נשמרו כי כבר נענו',
      '30 תמונות',
    ])
    assert.ok(!parts.join(' ').match(/[a-z]/i))
    assert.deepEqual(importSummaryParts({ masechet: 'ברכות', pages: 125 }), ['ברכות', 'עמודים: 125'])
    assert.deepEqual(importSummaryParts('הסתיים'), ['הסתיים'])
  })
})
