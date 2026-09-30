import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { HELP_SEEN_KEY } from './ProofHelp'
import ProofEditor from './ProofEditor'

// ביטול וחזרה של פעולות-המסגרות בעורך המלא (הסריקה, הסרגל והמקלדת מחוברים):
// ציור, הזזה, שינוי-גודל, זרם, מספר בזרם, סדר, סוג, "✓ המסגרות נכונות", מחיקה
// (בחלונית ובמקש Delete) ומחיקת-הכול — כל אחת צעד-ביטול אחד (גרירה = צעד אחד, לא
// צעד לכל תזוזת-עכבר), ב-Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z כשהמיקוד בסריקה או בחלונית,
// ובכפתורי "ביטול"/"חזרה" שבסרגל.

vi.mock('@/components/providers/DialogContext', () => {
  const api = { showAlert: vi.fn(), showConfirm: vi.fn(async () => true) }
  return { useDialog: () => api }
})

// עמוד דו-טורי: ראשי בשני טורים (הימני — שורות 1–2, השמאלי — 3) והערות בתחתית
const L = (id, bbox, text, stream = 'main', extra = {}) => ({
  id,
  order: id,
  line_no: id - 1,
  bbox,
  text,
  text_ocr: text,
  stream,
  stream_src: 'auto',
  status: 'pending',
  words: text.split(' ').map((t) => ({ text: t, styles: [] })),
  ...extra,
})
const page = () => ({
  id: 'pg1',
  page: 3,
  revision: 1,
  imageUrl: '/api/page-proof/pages/pg1/image?v=1',
  doc: {
    page: 3,
    revision: 1,
    size: [1000, 1000],
    frames: [],
    links: [],
    streams: [
      { key: 'main', he: 'ראשי', color: '#1a56db' },
      { key: 'notes', he: 'הערות', color: '#0e7f3c' },
    ],
    lines: [
      L(1, [520, 100, 900, 140], 'אלף בית גימל', 'main', { para_start: true }),
      L(2, [520, 150, 900, 190], 'דלת הא וו'),
      L(3, [100, 100, 480, 140], 'זין חית טית'),
      L(4, [100, 800, 900, 840], 'יוד כף למד', 'notes', { para_start: true }),
    ],
  },
})

let lastArgs
const actions = (args) => {
  lastArgs = args
  return null
}

const CTRL_Z = { key: 'ז', code: 'KeyZ', ctrlKey: true }
const CTRL_Y = { key: 'ט', code: 'KeyY', ctrlKey: true }
const CTRL_SHIFT_Z = { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }

const scan = () => screen.getByTestId('scan-panel')
const svg = () => screen.getByRole('img', { name: 'סריקת העמוד' })
const toolbar = () => screen.getByRole('toolbar', { name: 'כלי ההגהה' })
const popover = () => screen.getByTestId('frame-popover')
const click = (x, y) => {
  fireEvent.pointerDown(svg(), { button: 0, clientX: x, clientY: y, pointerId: 1 })
  fireEvent.pointerUp(svg(), { button: 0, clientX: x, clientY: y, pointerId: 1 })
}
// גרירה עם הרבה תזוזות-עכבר בדרך (צריך להיות צעד-ביטול אחד)
const drag = (from, to, el = svg()) => {
  fireEvent.pointerDown(el, { button: 0, clientX: from[0], clientY: from[1], pointerId: 1 })
  for (let i = 1; i <= 8; i++) {
    fireEvent.pointerMove(svg(), { clientX: from[0] + ((to[0] - from[0]) * i) / 8, clientY: from[1] + ((to[1] - from[1]) * i) / 8, pointerId: 1 })
  }
  fireEvent.pointerUp(svg(), { clientX: to[0], clientY: to[1], pointerId: 1 })
}

// מה שרואים: המסגרות (מקום וגודל), התוויות שעליהן ("ראשי 1", "הצעה"), כפתור-האישור והפעולות
const snap = () => ({
  frames: [...document.querySelectorAll('[data-layer="frames"] [data-frame]')].map((r) => ['x', 'y', 'width', 'height'].map((k) => Math.round(+r.getAttribute(k))).join(',')),
  badges: screen.queryAllByTestId('frame-badge').map((b) => b.textContent),
  confirm: within(scan()).getByRole('button', { name: /המסגרות (נכונות|אושרו)/ }).textContent,
  straddle: [...document.querySelectorAll('[data-straddle]')].map((e) => e.getAttribute('data-straddle')),
  ops: lastArgs.ops.map((o) => o.kind),
})

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(HELP_SEEN_KEY, '1')
  // זום 1: נקודת-לקוח = נקודה בתמונה (לסריקה אין מידות בסביבת-הבדיקות)
  window.localStorage.setItem('pageProof.scanZoom', JSON.stringify({ fit: false, zoom: 1 }))
  lastArgs = null
})

// הפעולה משנה משהו; Ctrl+Z (במקום שבו המיקוד אחריה) מחזיר בדיוק למה שהיה לפניה — צעד אחד;
// Ctrl+Y ו-Ctrl+Shift+Z מחזירים אותה; וכך גם כפתורי הסרגל
function expectOneUndoStep(doOp, { keyTarget = () => document.activeElement } = {}) {
  const before = snap()
  doOp()
  const after = snap()
  expect(after).not.toEqual(before)
  fireEvent.keyDown(keyTarget() || scan(), CTRL_Z)
  expect(snap()).toEqual(before)
  fireEvent.keyDown(scan(), CTRL_Y)
  expect(snap()).toEqual(after)
  fireEvent.keyDown(scan(), CTRL_Z)
  expect(snap()).toEqual(before)
  fireEvent.keyDown(scan(), CTRL_SHIFT_Z)
  expect(snap()).toEqual(after)
  fireEvent.click(within(toolbar()).getByRole('button', { name: 'ביטול' }))
  expect(snap()).toEqual(before)
  fireEvent.click(within(toolbar()).getByRole('button', { name: 'חזרה' }))
  expect(snap()).toEqual(after)
  return { before, after }
}

describe('ProofEditor — ביטול וחזרה של פעולות-המסגרות', { timeout: 30000 }, () => {
  it('ציור מסגרת חדשה — צעד אחד; המיקוד בסריקה', () => {
    render(<ProofEditor page={page()} persist={false} actions={actions} />)
    expectOneUndoStep(() => {
      fireEvent.click(within(scan()).getByRole('button', { name: 'מסגרת חדשה' }))
      drag([60, 60], [495, 160])
      expect(document.activeElement).toBe(scan())
    })
  })

  it('הזזת מסגרת בגרירה — צעד אחד (לא צעד לכל תזוזת-עכבר)', () => {
    render(<ProofEditor page={page()} persist={false} actions={actions} />)
    click(700, 120)
    const { before, after } = expectOneUndoStep(() => drag([700, 120], [700, 170]))
    expect(after.frames).not.toEqual(before.frames)
  })

  it('שינוי-גודל בידית — צעד אחד', () => {
    const { container } = render(<ProofEditor page={page()} persist={false} actions={actions} />)
    click(700, 120)
    const s = container.querySelector('[data-handle="s"][data-fid]')
    const hx = +s.getAttribute('x') + +s.getAttribute('width') / 2
    const hy = +s.getAttribute('y') + +s.getAttribute('height') / 2
    expectOneUndoStep(() => drag([hx, hy], [hx, hy - 50], s))
  })

  it('זרם המסגרת (בחלונית) — צעד אחד, גם כשהמיקוד על הכפתור שבחלונית', () => {
    render(<ProofEditor page={page()} persist={false} actions={actions} />)
    click(700, 120)
    let chip
    expectOneUndoStep(
      () => {
        chip = within(popover()).getByRole('button', { name: 'הערות' })
        chip.focus()
        fireEvent.click(chip)
      },
      { keyTarget: () => chip }
    )
  })

  it('המספר בזרם, הסדר בעמוד וסוג המסגרת (בחלונית) — כל אחד צעד אחד', () => {
    render(<ProofEditor page={page()} persist={false} actions={actions} />)
    click(300, 120) // הטור השמאלי: ראשי 2
    expectOneUndoStep(() => fireEvent.click(within(popover()).getByRole('button', { name: 'מספר קטן יותר בזרם' })))
    // סדר-הקריאה: לאן שאפשר (אחרי שינוי המספר המסגרת אולי כבר ראשונה)
    expectOneUndoStep(() => {
      const prev = within(popover()).getByRole('button', { name: 'הקודם' })
      fireEvent.click(prev.disabled ? within(popover()).getByRole('button', { name: 'הבא' }) : prev)
    })
    let select
    expectOneUndoStep(
      () => {
        select = within(popover()).getByRole('combobox', { name: 'סוג המסגרת' })
        select.focus()
        fireEvent.change(select, { target: { value: select.options[1].value } })
      },
      { keyTarget: () => select }
    )
  })

  it('"✓ המסגרות נכונות" — צעד אחד (חוזרים להצעה, והכפתור שוב פעיל)', () => {
    render(<ProofEditor page={page()} persist={false} actions={actions} />)
    const { before, after } = expectOneUndoStep(() => fireEvent.click(within(scan()).getByRole('button', { name: /המסגרות נכונות/ })))
    expect(before.confirm).toMatch(/המסגרות נכונות/)
    expect(after.confirm).toMatch(/המסגרות אושרו/)
    expect(before.badges.every((b) => b.includes('הצעה'))).toBe(true)
  })

  it('מחיקה — בכפתור שבחלונית ובמקש Delete; וגם "מחיקת כל המסגרות" — כל אחת צעד אחד', () => {
    render(<ProofEditor page={page()} persist={false} actions={actions} />)
    // קודם: מסגרות שמורות (אישור), ואז המחיקות — כל אחת מבוטלת לבדה
    fireEvent.click(within(scan()).getByRole('button', { name: /המסגרות נכונות/ }))
    click(700, 120)
    expectOneUndoStep(() => fireEvent.click(within(popover()).getByRole('button', { name: /מחיקה/ })))
    click(300, 120)
    expectOneUndoStep(() => fireEvent.keyDown(scan(), { key: 'Delete' }))
    expectOneUndoStep(() => {
      fireEvent.click(within(scan()).getByRole('button', { name: 'עוד' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'מחיקת כל המסגרות' }))
    })
  })

  it('כמה פעולות ברצף — כל Ctrl+Z מבטל אחת, מהאחרונה לראשונה', () => {
    render(<ProofEditor page={page()} persist={false} actions={actions} />)
    const s0 = snap()
    click(700, 120)
    drag([700, 120], [700, 170]) // הזזה (שומרת את ההצעה)
    const s1 = snap()
    fireEvent.click(within(popover()).getByRole('button', { name: 'הערות' })) // זרם
    const s2 = snap()
    // אישור: אחרי ההזזה שורה 1 כבר מחוץ לכל מסגרת — קודם שאלה, ו"כן, לאשר" מאשר (עדיין צעד אחד)
    fireEvent.click(within(scan()).getByRole('button', { name: /המסגרות נכונות/ }))
    fireEvent.click(within(scan()).getByRole('button', { name: 'כן, לאשר' }))
    const s3 = snap()
    expect(new Set([JSON.stringify(s0), JSON.stringify(s1), JSON.stringify(s2), JSON.stringify(s3)]).size).toBe(4)
    fireEvent.keyDown(scan(), CTRL_Z)
    expect(snap()).toEqual(s2)
    fireEvent.keyDown(scan(), CTRL_Z)
    expect(snap()).toEqual(s1)
    fireEvent.keyDown(scan(), CTRL_Z)
    expect(snap()).toEqual(s0)
    fireEvent.keyDown(scan(), CTRL_Y)
    fireEvent.keyDown(scan(), CTRL_Y)
    fireEvent.keyDown(scan(), CTRL_Y)
    expect(snap()).toEqual(s3)
  })

  it('"השורה שייכת למסגרת הזו" — פעולת stream אחת: הסימון האדום יורד, Ctrl+Z מחזיר אותו, והפעולה נשלחת בהגשה', async () => {
    const p = page()
    p.doc.frames = [{ fid: 'aa11bb', stream: 'main', bbox: [510, 90, 910, 200], order: 1 }]
    p.doc.lines[1] = L(2, [520, 150, 930, 190], 'דלת הא וו') // בולטת ימינה מהמסגרת
    render(<ProofEditor page={p} persist={false} actions={actions} />)
    click(925, 170) // על השורה, מחוץ למסגרת: הסמן עובר אליה
    // הסריקה מקבלת את שורת-הסמן בפריים שאחרי הרינדור (ProofEditor.measureTrack)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    const { before, after } = expectOneUndoStep(() =>
      fireEvent.click(within(screen.getByTestId('straddle-claim')).getByRole('button', { name: 'השורה שייכת למסגרת הזו' }))
    )
    expect(before.straddle).toEqual(['2'])
    expect(after.straddle).toEqual([])
    expect(lastArgs.ops.map(({ kind, ids, value }) => ({ kind, ids, value }))).toEqual([{ kind: 'stream', ids: [2], value: 'main' }])
  })
})
