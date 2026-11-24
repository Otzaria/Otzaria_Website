// חלון-הסקירה שבתוך קובץ "אישור בלי אינטרנט" (docs/115 §4) — רץ ב-jsdom כמו שהוא רץ בקובץ:
// הנתונים ב-<script id="tp-data">, תמונה בכל <script data-img>, ואז viewerMain() — סגורה לגמרי.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { viewerMain } from './viewer.js'
import { scriptJson, htmlTail } from './html.js'
import { VIEWER_LABELS, VIEWER_COLORS, checkDecisionsFile } from './contract.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function ocr(i, extra = {}) {
  return {
    id: String(i).padStart(24, 'a'),
    v: `2026-11-2${i}T10:00:00.000Z`,
    r: 0,
    img: `i${i}`,
    w: 100,
    h: 20,
    alias: 'ספר 4',
    page: 3,
    line: i,
    track: 'rashi',
    source: 'ocr',
    text: `שורה מספר ${i}`,
    conf: 90,
    result: { action: 'ok' },
    vol: { id: 'v1', name: 'רחל' },
    rejected: 0,
    ctx: null,
    ...extra,
  }
}

function mount(section, items, extra = {}) {
  document.body.innerHTML = ''
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  const data = document.createElement('script')
  data.type = 'application/json'
  data.id = 'tp-data'
  data.textContent = scriptJson({
    kind: 'tpo/1',
    offline_id: 'tpo-20261123-abcdef',
    section,
    part: 1,
    parts: 1,
    created_at: '2026-11-23T10:00:00.000Z',
    site: 'https://example.org',
    labels: VIEWER_LABELS,
    colors: VIEWER_COLORS,
    book: null,
    items,
    ...extra,
  })
  document.body.appendChild(data)
  for (const it of items) {
    const s = document.createElement('script')
    s.type = 'text/plain'
    s.setAttribute('data-img', it.img)
    s.setAttribute('data-t', 'image/png')
    s.textContent = PNG
    document.body.appendChild(s)
  }
  viewerMain()
}

const key = (k, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }))
const cards = () => [...document.querySelectorAll('.card')]
const btn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text))

let saved
beforeEach(() => {
  window.localStorage.clear()
  saved = []
  // jsdom: אין createObjectURL, ולחיצה על קישור-הורדה לא עושה כלום — לוכדים את הקובץ
  URL.createObjectURL = vi.fn((blob) => {
    saved.push(blob)
    return `blob:x/${saved.length}`
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => vi.restoreAllMocks())

async function savedFile() {
  key('s', { ctrlKey: true })
  const blob = saved.findLast((b) => b.type === 'application/json')
  return JSON.parse(await blob.text())
}

describe('viewerMain — זיהוי טקסט', () => {
  it('הפונקציה סגורה: נכתבת לקובץ ונטענת בלי שום שם מבחוץ', () => {
    const src = htmlTail()
    expect(src).toContain('(function viewerMain()')
    // מריצים את המקור כמחרוזת, כמו בקובץ — בלי גישה לשום import
    mount('ocr', [ocr(1)])
    document.querySelector('#app').innerHTML = ''
    new Function(src.replace(/^<script>|<\/script>[\s\S]*$/g, ''))()
    expect(cards()).toHaveLength(1)
  })

  it('מקשים: אשר, דחה, תקן ואשר, לא קריא; ההחלטה עוברת לשורה הבאה ונשמרת בזיכרון', async () => {
    mount('ocr', [ocr(1), ocr(2), ocr(3), ocr(4), ocr(5)])
    expect(cards()).toHaveLength(5)
    key('1') // אשר את 1 → יוצא מ"עוד לא החלטתי"
    expect(cards()).toHaveLength(4)
    key('3') // דחה את 2
    key('2') // תקן את 3
    const ta = document.querySelector('textarea')
    expect(ta.value).toBe('שורה מספר 3')
    ta.value = 'שורה  מתוקנת '
    ta.dispatchEvent(new Event('input'))
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    key('4') // לא קריא — 4
    expect(cards()).toHaveLength(1)
    expect(document.querySelector('header').textContent).toContain('אושרו: 1')

    const mem = JSON.parse(window.localStorage.getItem('tp-offline:tpo-20261123-abcdef:1'))
    expect(Object.keys(mem.dec)).toHaveLength(4)

    const f = await savedFile()
    expect(f).toMatchObject({ contract: 'tpd/1', section: 'ocr', offline_id: 'tpo-20261123-abcdef', part: 1 })
    expect(f.decisions).toEqual([
      { id: ocr(1).id, v: ocr(1).v, r: 0, d: 'approve' },
      { id: ocr(2).id, v: ocr(2).v, r: 0, d: 'reject' },
      { id: ocr(3).id, v: ocr(3).v, r: 0, d: 'fix', mark: { action: 'fixed', text: 'שורה מתוקנת' } },
      { id: ocr(4).id, v: ocr(4).v, r: 0, d: 'fix', mark: { action: 'bad' } },
    ])
    // הקובץ עובר את הבדיקה של השרת
    expect(checkDecisionsFile(f).error).toBeUndefined()
    // אחרי השמירה — "לא נשמרו" מתאפס
    expect(btn('שמור קובץ-החלטות').textContent).not.toContain('לא נשמרו')
  })

  it('פתיחה מחדש ממשיכה מאותו מקום; בטל החלטה; טקסט זהה לשל המתנדב = אישור', async () => {
    mount('ocr', [ocr(1), ocr(2, { result: { action: 'fixed', text: 'נוסח המתנדב' } })])
    key('1')
    mount('ocr', [ocr(1), ocr(2, { result: { action: 'fixed', text: 'נוסח המתנדב' } })])
    expect(cards()).toHaveLength(1)
    expect([...cards()[0].querySelectorAll('ins')].map((x) => x.textContent)).toEqual(['נוסח', 'המתנדב']) // ההבדל מול המודל
    key('2')
    document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    const f = await savedFile()
    expect(f.decisions.map((d) => d.d)).toEqual(['approve', 'approve'])
    // "הכול" ← בטל החלטה
    const sel = document.querySelector('select')
    sel.value = 'all'
    sel.dispatchEvent(new Event('change'))
    expect(cards()).toHaveLength(2)
    key('Backspace')
    expect(document.querySelector('header').textContent).toContain('עוד לא הוחלט: 1')
  })

  it('גורף: "אשר כל ה\'נכון\'" — רק מה שהמתנדב סימן נכון', () => {
    mount('ocr', [ocr(1), ocr(2, { result: { action: 'fixed', text: 'אחר' } }), ocr(3)])
    btn('אשר כל ה"נכון"').click()
    expect(cards()).toHaveLength(1)
    expect(cards()[0].textContent).toContain('תוקן')
  })

  it.each([
    { v: '2026-11-24T10:00:00.000Z' },
    { r: 1 },
  ])('הורדה מחדש אינה מחילה החלטה מקומית על הגשה/גרסה אחרת (%j)', async (changed) => {
    mount('ocr', [ocr(1), ocr(2)])
    key('1')
    const mem = JSON.parse(window.localStorage.getItem('tp-offline:tpo-20261123-abcdef:1'))
    expect(mem.dec[ocr(1).id]).toEqual({ v: ocr(1).v, r: 0, d: 'approve' })
    mount('ocr', [ocr(1, changed), ocr(2)])
    expect(cards()).toHaveLength(2)
    expect(document.querySelector('.toast').textContent).toMatch(/אינן מתאימות לגרסה/)
    key('ArrowDown')
    key('1')
    expect((await savedFile()).decisions).toEqual([{ id: ocr(2).id, v: ocr(2).v, r: 0, d: 'approve' }])
  })

  it('שמירה מקומית ישנה בלי חותם אינה מקבלת את חותם ההגשה החדשה', () => {
    window.localStorage.setItem('tp-offline:tpo-20261123-abcdef:1', JSON.stringify({ dec: { [ocr(1).id]: { d: 'approve' } }, dirty: {} }))
    mount('ocr', [ocr(1)])
    expect(cards()).toHaveLength(1)
    key('s', { ctrlKey: true })
    expect(saved.filter((b) => b.type === 'application/json')).toHaveLength(0)
  })

  it('אישור וביטול גורפים שומרים את המצב פעם אחת גם עבור אלף שורות', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ocr(1, { id: i.toString(16).padStart(24, '0'), img: `i${i}` }))
    mount('ocr', items)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    btn('אשר את כל המוצגות').click()
    expect(writes).toHaveBeenCalledTimes(1)
    expect(Object.keys(JSON.parse(writes.mock.calls[0][1]).dec)).toHaveLength(1000)
    const select = document.querySelector('select')
    select.value = 'all'
    select.dispatchEvent(new Event('change'))
    writes.mockClear()
    btn('בטל החלטות במוצגות').click()
    expect(writes).toHaveBeenCalledTimes(1)
    expect(JSON.parse(writes.mock.calls[0][1]).dec).toEqual({})
  })

  it('טעינת קובץ-החלטות: מה שמתאים נטען, הגשה אחרת לא', async () => {
    mount('ocr', [ocr(1), ocr(2)])
    const file = new File(
      [JSON.stringify({ contract: 'tpd/1', section: 'ocr', decisions: [{ id: ocr(1).id, v: ocr(1).v, d: 'reject' }, { id: ocr(2).id, v: '2020-01-01T00:00:00.000Z', d: 'approve' }] })],
      'd.json'
    )
    const input = document.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(document.querySelector('.toast')?.textContent).toMatch(/נטענו 1/))
    expect(document.querySelector('.toast').textContent).toMatch(/הגשה אחרת/)
    expect(cards()).toHaveLength(1)
  })

  it('טעינת קובץ-החלטות דורשת גם את גרסת התוכן ושומרת אותה בייצוא', async () => {
    mount('ocr', [ocr(1, { r: 2 }), ocr(2, { r: 2 }), ocr(3)])
    const file = new File([JSON.stringify({ contract: 'tpd/1', section: 'ocr', decisions: [
      { id: ocr(1).id, v: ocr(1).v, r: 1, d: 'approve' },
      { id: ocr(2).id, v: ocr(2).v, r: 2, d: 'reject' },
      { id: ocr(3).id, v: ocr(3).v, d: 'approve' }, // קובץ ישן: r חסר = 0
    ] })], 'd.json')
    const input = document.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(document.querySelector('.toast')?.textContent).toMatch(/נטענו 2/))
    expect(cards()).toHaveLength(1)
    expect((await savedFile()).decisions).toEqual([
      { id: ocr(2).id, v: ocr(2).v, r: 2, d: 'reject' },
      { id: ocr(3).id, v: ocr(3).v, r: 0, d: 'approve' },
    ])
  })

  it('תמונה שחסרה בקובץ — הודעה במקום התמונה', () => {
    mount('ocr', [ocr(1)])
    document.querySelector('script[data-img]').remove()
    document.querySelector('#app').innerHTML = ''
    viewerMain()
    expect(document.querySelector('.missing').textContent).toMatch(/חסרה/)
  })
})

describe('viewerMain — נתב וגלאי', () => {
  const router = (i, extra = {}) => ({
    ...ocr(i),
    track: undefined,
    pred: 'square',
    predP: 0.8,
    words: [
      { k: 0, box: [60, 0, 100, 20], pred: 'square', text: '' },
      { k: 1, box: [0, 0, 50, 20], pred: 'rashi', text: '' },
    ],
    result: { label: 'square', bad: false },
    agrees: true,
    ...extra,
  })

  it('Enter מאשר; 2 ואז Enter — תיקון כתב; 4 = מעורבת עם המילים, לחיצה מחליפה כתב-מילה', async () => {
    mount('router', [router(1), router(2), router(3)])
    key('Enter')
    key('2')
    key('Enter')
    key('4')
    const words = document.querySelectorAll('.card.cur .word')
    expect(words).toHaveLength(2)
    words[1].click() // rashi → latin
    key('Enter')
    const f = await savedFile()
    expect(f.decisions).toEqual([
      { id: router(1).id, v: router(1).v, r: 0, d: 'approve' },
      { id: router(2).id, v: router(2).v, r: 0, d: 'fix', mark: { label: 'rashi', bad: false } },
      {
        id: router(3).id,
        v: router(3).v,
        r: 0,
        d: 'fix',
        mark: { label: 'mixed', bad: false, words: [{ k: 0, box: [60, 0, 100, 20], label: 'square' }, { k: 1, box: [0, 0, 50, 20], label: 'latin' }] },
      },
    ])
  })

  it('בחירת כתב בעכבר בכרטיס השני ואז Enter מתקנת רק את הכרטיס השני', async () => {
    mount('router', [router(1), router(2)])
    ;[...cards()[1].querySelectorAll('button')].find((b) => b.textContent.includes('רש"י')).click()
    expect(document.querySelector('.card.cur').dataset.id).toBe(router(2).id)
    key('Enter')
    expect((await savedFile()).decisions).toEqual([
      { id: router(2).id, v: router(2).v, r: 0, d: 'fix', mark: { label: 'rashi', bad: false } },
    ])
    expect(cards()[0].dataset.id).toBe(router(1).id)
  })

  it('שינוי כתב-מילה בכרטיס שאינו הנוכחי ואז Enter שומר אותו', async () => {
    const mixed = router(2, { result: { label: 'mixed', bad: false, words: [
      { k: 0, box: [60, 0, 100, 20], label: 'square' },
      { k: 1, box: [0, 0, 50, 20], label: 'rashi' },
    ] } })
    mount('router', [router(1), mixed])
    cards()[1].querySelectorAll('.word')[1].click()
    expect(document.querySelector('.card.cur').dataset.id).toBe(mixed.id)
    key('Enter')
    const f = await savedFile()
    expect(f.decisions).toHaveLength(1)
    expect(f.decisions[0]).toMatchObject({ id: mixed.id, r: 0, d: 'fix', mark: { label: 'mixed', words: [{ label: 'square' }, { label: 'latin' }] } })
    expect(cards()[0].dataset.id).toBe(router(1).id)
  })

  it('גלאי: מסגרות על העמוד, "לתקן באתר" אינו החלטה שעולה', async () => {
    const page = (i) => ({
      id: String(i).padStart(24, 'b'),
      v: `2026-11-2${i}T10:00:00.000Z`,
      r: 0,
      img: `p${i}`,
      w: 1000,
      h: 1400,
      alias: 'ספר 9',
      page: i,
      ptype: 'scan',
      scale: 1,
      frames: [{ fid: 'f1', kind: 'text', role: 'body', box: [10, 10, 500, 900], stream: 's1', ord: 1 }],
      result: { status: 'marked', frames: [{ fid: 'f1', kind: 'text', role: 'commentary', box: [10, 10, 500, 900], stream: 's1', ord: 1 }] },
      changes: 1,
      vol: { id: 'v1', name: 'רחל' },
      rejected: 0,
    })
    mount('frames', [page(1), page(2)], { book: { alias: 'ספר 9', streams: [{ id: 's1', name: 'פנים', role: 'body' }] } })
    expect(document.querySelectorAll('.card.cur .box')).toHaveLength(1)
    expect(document.querySelector('.card.cur .box span').textContent).toContain('פנים')
    key('2')
    key('1')
    const f = await savedFile()
    expect(f.decisions).toEqual([{ id: page(2).id, v: page(2).v, r: 0, d: 'approve' }])
    expect(f.later).toEqual([page(1).id])
  })
})
