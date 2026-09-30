import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect, useMemo, useState } from 'react'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScanPanel from './ScanPanel'
import { buildView, validateOp } from '@/lib/pageProof/ops'
import { FURNITURE_TAB } from '@/lib/pageProof/textModel'

// עמוד דו-טורי: ראשי בשני טורים (הימני — שורות 1–2, השמאלי — 3) והערות בתחתית
const L = (id, bbox, stream = 'main', extra = {}) => ({
  id,
  line_no: id - 1,
  order: id,
  bbox,
  text: `שורה ${id}`,
  text_ocr: `שורה ${id}`,
  status: 'pending',
  stream,
  stream_src: 'auto',
  words: [],
  ...extra,
})

const doc = () => ({
  contract: 1,
  page: 3,
  size: [1000, 1000],
  frames: [],
  links: [],
  streams: [
    { key: 'main', he: 'ראשי', color: '#1a56db' },
    { key: 'notes', he: 'הערות', color: '#0e7f3c' },
  ],
  stream_vocab: [],
  lines: [
    L(1, [520, 100, 900, 140]),
    L(2, [520, 150, 900, 190]),
    L(3, [100, 100, 480, 140]),
    L(4, [100, 800, 900, 840], 'notes'),
  ],
})

// כמו useProofEditor: בדיקה מול העמוד המקורי, רשימת-פעולות, תצוגה מחושבת.
// onView(view) — התצוגה העדכנית (הזרם שכל שורה קיבלה מהמסגרות)
function Harness({ base, log, initialMode = 'frames', readOnly = false, locked, onPick, onView, tab = 'main', currentWord = -1, current = 1 }) {
  const [ops, setOps] = useState([])
  const [mode, setMode] = useState(initialMode)
  const view = useMemo(() => buildView(base, ops), [base, ops])
  useEffect(() => {
    onView?.(view)
  }, [view, onView])
  const push = (...list) => {
    for (const op of list) {
      const e = validateOp(base, op)
      if (e) {
        log.errors.push(e)
        return false
      }
    }
    log.groups.push(list)
    setOps((o) => [...o, ...list])
    return true
  }
  return (
    <ScanPanel
      view={view}
      imageUrl="/p.png"
      mode={mode}
      setMode={setMode}
      readOnly={readOnly}
      currentLineId={current}
      currentWord={currentWord}
      lockedLineIds={locked}
      onPickLine={onPick}
      push={push}
      frameStreamDefault={tab}
    />
  )
}

const setup = (props = {}) => {
  const log = { groups: [], errors: [], view: null }
  const onPick = vi.fn()
  const onView = (v) => {
    log.view = v
  }
  const base = doc()
  const utils = render(<Harness base={base} log={log} onPick={onPick} onView={onView} {...props} />)
  return { log, onPick, ...utils }
}

const svgOf = () => screen.getByRole('img', { name: 'סריקת העמוד' })
const click = (x, y, extra = {}) => {
  fireEvent.pointerDown(svgOf(), { button: 0, clientX: x, clientY: y, pointerId: 1, ...extra })
  fireEvent.pointerUp(svgOf(), { clientX: x, clientY: y, pointerId: 1, ...extra })
}

beforeEach(() => {
  // זום 1: נקודת-לקוח = נקודה בתמונה (לסריקה אין מידות בסביבת-הבדיקות)
  window.localStorage.setItem('pageProof.scanZoom', JSON.stringify({ fit: false, zoom: 1 }))
})

describe('ScanPanel — מסגרות', () => {
  it('בלי מסגרות בעמוד: הצעת המחשב, מקווקוות, בלי תיבות-שורה', () => {
    const { container } = setup()
    const badges = screen.getAllByTestId('frame-badge')
    expect(badges.map((b) => b.textContent)).toEqual(['1ראשי 1· הצעה', '2ראשי 2· הצעה', '3הערות 1· הצעה'])
    expect(container.querySelectorAll('[data-line-box]')).toHaveLength(0)
    expect(screen.getByTestId('caret-marker')).toBeInTheDocument()
    expect(screen.getByText(/הצעה של המחשב/)).toBeInTheDocument()
  })

  it('"✓ המסגרות נכונות": קבוצה אחת — frames_set מאושר + frame_seq לכל מסגרת', async () => {
    const { log } = setup()
    await userEvent.click(screen.getByRole('button', { name: /המסגרות נכונות/ }))
    expect(log.errors).toEqual([])
    expect(log.groups).toHaveLength(1)
    const [set, ...seqs] = log.groups[0]
    expect(set.kind).toBe('frames_set')
    expect(set.value.confirmed).toBe(true)
    expect(set.value.manual).toBe(true)
    expect(set.value.frames).toHaveLength(3)
    expect(seqs.map((o) => [o.kind, o.value.seq])).toEqual([
      ['frame_seq', 1],
      ['frame_seq', 2],
      ['frame_seq', 1],
    ])
    // אחרי האישור: מסגרות אמיתיות (לא "הצעה") והכפתור מסמן שאושרו
    expect(screen.queryByText(/· הצעה/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /המסגרות אושרו/ })).toBeDisabled()
  })

  it('לחיצה בתוך מסגרת: הסמן עובר לשורה שם והחלונית נפתחת; שינוי זרם שומר את כל ההצעות', async () => {
    const { log, onPick } = setup()
    click(700, 170)
    expect(onPick).toHaveBeenCalledWith(2)
    const pop = screen.getByTestId('frame-popover')
    expect(within(pop).getByText('מסגרת 1 בסדר הקריאה')).toBeInTheDocument()
    await userEvent.click(within(pop).getByRole('button', { name: 'הערות' }))
    expect(log.errors).toEqual([])
    const [set, ...seqs] = log.groups[0]
    expect(set.value.frames.map((f) => f.stream)).toEqual(['notes', 'main', 'notes'])
    expect(seqs).toHaveLength(3)
    expect(screen.getAllByTestId('frame-badge').map((b) => b.textContent)).toEqual(['1הערות 1', '2ראשי 1', '3הערות 2'])
  })

  it('לחיצה בין השורות בתוך מסגרת — השורה הקרובה; מחוץ למסגרות ולשורות — כלום', () => {
    const { onPick } = setup()
    click(700, 145)
    expect(onPick).toHaveBeenLastCalledWith(1)
    onPick.mockClear()
    click(50, 500)
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
  })

  it('מחיקת מסגרת מוצעת שומרת את השאר; "מספר בזרם" מסדר מחדש בתוך הזרם', async () => {
    const { log } = setup()
    click(700, 120)
    await userEvent.click(within(screen.getByTestId('frame-popover')).getByRole('button', { name: /מחיקה/ }))
    expect(log.groups[0][0].value.frames.map((f) => f.stream)).toEqual(['main', 'notes'])
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()

    // הטור השמאלי (עכשיו ראשי 1 היחיד) — אין לאן להזיז; אחרי ציור מסגרת נוספת בזרם
    click(300, 120)
    const pop = screen.getByTestId('frame-popover')
    expect(within(pop).getByRole('button', { name: 'מספר גדול יותר בזרם' })).toBeDisabled()
  })

  it('ציור מסגרת חדשה: מתהדקת סביב השורות, בזרם הנבחר, ונבחרת — בלי לפתוח את החלונית', async () => {
    const { log, container } = setup()
    // קודם מאשרים את ההצעה, כדי שהציור יהיה עריכה של מסגרות קיימות
    await userEvent.click(screen.getByRole('button', { name: /המסגרות נכונות/ }))
    await userEvent.click(screen.getByRole('button', { name: 'מסגרת חדשה' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'הזרם של המסגרת החדשה' })).getByRole('button', { name: 'הערות' }))
    fireEvent.pointerDown(svgOf(), { button: 0, clientX: 60, clientY: 60, pointerId: 1 })
    fireEvent.pointerMove(svgOf(), { clientX: 495, clientY: 160, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: 495, clientY: 160, pointerId: 1 })
    expect(log.errors).toEqual([])
    const g = log.groups[1]
    expect(g).toHaveLength(1)
    const before = new Set(log.groups[0][0].value.frames.map((f) => f.fid))
    const added = g[0].value.frames.filter((f) => !before.has(f.fid))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ stream: 'notes', bbox: [96, 96, 484, 144] })
    // נבחרת (הידיות שלה מוצגות), אבל החלונית לא נפתחת מעצמה — רק בלחיצה על המסגרת
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    expect(container.querySelectorAll(`[data-handle][data-fid="${added[0].fid}"]`)).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'בחירה', pressed: true })).toBeInTheDocument()
  })

  it('ציור מסגרת כשהחלונית פתוחה למסגרת אחרת — החלונית לא עוברת למסגרת החדשה; לחיצה עליה פותחת את שלה', async () => {
    const { log, container } = setup()
    click(700, 120)
    expect(screen.getByTestId('frame-popover')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'מסגרת חדשה' }))
    // באזור בלי שורות — המסגרת נשארת כפי שצוירה
    fireEvent.pointerDown(svgOf(), { button: 0, clientX: 300, clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(svgOf(), { clientX: 700, clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: 700, clientY: 500, pointerId: 1 })
    expect(log.errors).toEqual([])
    expect(log.groups).toHaveLength(1)
    const added = log.groups[0][0].value.frames.find((f) => f.bbox[1] === 400)
    expect(added).toMatchObject({ stream: 'main', bbox: [300, 400, 700, 500] })
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    expect(container.querySelectorAll(`[data-handle][data-fid="${added.fid}"]`)).toHaveLength(8)
    click(500, 450)
    const pop = screen.getByTestId('frame-popover')
    expect(within(pop).getByRole('button', { name: 'ראשי', pressed: true })).toBeInTheDocument()
    expect(container.querySelectorAll(`[data-handle][data-fid="${added.fid}"]`)).toHaveLength(8)
  })

  it('לקריאה בלבד: בלי כלים ובלי אישור; לחיצה עדיין מזיזה את הסמן', () => {
    const { onPick } = setup({ readOnly: true })
    expect(screen.queryByRole('button', { name: /המסגרות נכונות/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'מסגרת חדשה' })).not.toBeInTheDocument()
    click(700, 120)
    expect(onPick).toHaveBeenCalledWith(1)
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
  })
})

describe('ScanPanel — שורות', () => {
  it('מעבר למצב "שורות" מציג את תיבות-השורות', async () => {
    const { container } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'שורות' }))
    expect(container.querySelectorAll('[data-line-box]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-frame]')).toHaveLength(0)
  })

  it('שורה נעולה מסומנת "לזיהוי מחדש"; בחירת שתי שורות ואיחוד', async () => {
    const { log, onPick } = setup({ initialMode: 'lines', locked: new Set([4]) })
    expect(screen.getAllByTestId('recut-label')).toHaveLength(1)
    const merge = screen.getByRole('button', { name: 'איחוד' })
    expect(merge).toBeDisabled()
    click(700, 120)
    expect(onPick).toHaveBeenCalledWith(1)
    click(700, 170, { shiftKey: true })
    expect(merge).toBeEnabled()
    await userEvent.click(merge)
    expect(log.errors).toEqual([])
    expect(log.groups).toEqual([[{ kind: 'line_merge', page: 3, ids: [1, 2] }]])
    // השורה הממוזגת ממתינה לזיהוי מחדש
    expect(screen.getAllByTestId('recut-label')).toHaveLength(2)
  })

  it('פיצול בלחיצה בתוך שורה; שורה חדשה בציור (בלי זרם — נגזר)', async () => {
    const { log } = setup({ initialMode: 'lines' })
    await userEvent.click(screen.getByRole('button', { name: 'פיצול' }))
    click(700, 120)
    expect(log.groups[0]).toEqual([{ kind: 'line_split', page: 3, ids: [1], value: { x: 700 } }])
    // אי-אפשר לפצל חצי-שורה שנוצר עכשיו
    click(650, 120)
    expect(screen.getByRole('status')).toHaveTextContent(/יצרתם עכשיו בתיקון/)
    expect(log.groups).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'שורה חדשה' }))
    fireEvent.pointerDown(svgOf(), { button: 0, clientX: 100, clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(svgOf(), { clientX: 480, clientY: 440, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: 480, clientY: 440, pointerId: 1 })
    expect(log.errors).toEqual([])
    expect(log.groups[1]).toEqual([{ kind: 'line_add', page: 3, value: { bbox: [100, 400, 480, 440], text: '' } }])
    expect(screen.getByRole('button', { name: 'בחירה', pressed: true })).toBeInTheDocument()
  })

  it('לא-שורה ושחזור; "החיתוך בעמוד תקין"', async () => {
    const { log } = setup({ initialMode: 'lines' })
    click(300, 120)
    await userEvent.click(screen.getByRole('button', { name: 'לא-שורה' }))
    expect(log.groups[0]).toEqual([{ kind: 'status', page: 3, ids: [3], value: 'removed' }])
    await userEvent.click(screen.getByRole('button', { name: 'שחזור שורה' }))
    expect(log.groups[1]).toEqual([{ kind: 'status', page: 3, ids: [3], value: 'restore' }])
    await userEvent.click(screen.getByRole('button', { name: /החיתוך בעמוד תקין/ }))
    expect(log.groups[2]).toEqual([{ kind: 'cut_ok', page: 3, value: true }])
    expect(screen.getByRole('button', { name: /החיתוך סומן כתקין/ })).toBeDisabled()
  })

  it('Escape מנקה את הבחירה', () => {
    setup({ initialMode: 'lines' })
    click(700, 120)
    expect(screen.getByRole('button', { name: 'לא-שורה' })).toBeEnabled()
    act(() => {
      fireEvent.keyDown(screen.getByTestId('scan-panel'), { key: 'Escape' })
    })
    expect(screen.getByRole('button', { name: 'לא-שורה' })).toBeDisabled()
  })
})

describe('ScanPanel — סדר ההצעה, שורות מחוץ למסגרות, מקלדת ומיקוד', () => {
  const headed = () => ({
    ...doc(),
    lines: [
      L(1, [350, 40, 650, 80], 'main_heading'),
      L(2, [520, 100, 900, 140]),
      L(3, [520, 150, 900, 190]),
      L(4, [100, 100, 480, 140]),
      L(5, [100, 150, 480, 190]),
      L(6, [100, 800, 900, 840], 'notes'),
    ],
  })

  it('כותרת מעל שני טורים: "ראשי — כותרת 1", הימני 2, השמאלי 3 — וכך בדיוק נשלח ב"✓"', async () => {
    const { log } = setup({ base: headed() })
    expect(screen.getAllByTestId('frame-badge').map((b) => b.textContent)).toEqual([
      '1ראשי — כותרת 1· הצעה',
      '2ראשי 2· הצעה',
      '3ראשי 3· הצעה',
      '4הערות 1· הצעה',
    ])
    await userEvent.click(screen.getByRole('button', { name: /המסגרות נכונות/ }))
    expect(log.errors).toEqual([])
    const [set, ...seqs] = log.groups[0]
    expect(set.value.frames.map((f) => [f.order, f.stream])).toEqual([
      [1, 'main_heading'],
      [2, 'main'],
      [3, 'main'],
      [4, 'notes'],
    ])
    expect(seqs.map((o) => o.value.seq)).toEqual([1, 2, 3, 1])
  })

  it('שורה שנחתכה על פני שני הטורים: שתי מסגרות (לא אחת ענקית), והשורה בולטת באדום כבר בהצעה', () => {
    const base = {
      ...doc(),
      lines: [
        L(1, [520, 100, 900, 140]),
        L(2, [520, 150, 900, 190]),
        L(3, [100, 100, 480, 140]),
        L(4, [100, 150, 480, 190]),
        L(5, [100, 200, 900, 240]),
        L(6, [520, 250, 900, 290]),
        L(7, [100, 250, 480, 290]),
        L(8, [100, 800, 900, 840], 'notes'),
      ],
    }
    const { container } = setup({ base })
    expect(screen.getAllByTestId('frame-badge').map((b) => b.textContent)).toEqual(['1ראשי 1· הצעה', '2ראשי 2· הצעה', '3הערות 1· הצעה'])
    expect(container.querySelector('[data-straddle="5"]')).toBeInTheDocument()
    expect(screen.getByTestId('straddle-note')).toHaveTextContent(/שורה אחת בולטת/)
  })

  it('קו מפריד (ריהוט) שהתיבה שלו נוגעת בתחתית מסגרת — לא מסומן "בולט"; שורת-תוכן באותו מקום — כן', () => {
    // שורה 2 חופפת את תחתית המסגרת [510, 90, 910, 145] (מרכזה מתחת למסגרת — לא "בתוכה")
    const withEdge = (stream) => ({
      ...doc(),
      frames: [{ fid: 'aa11bb', stream: 'main', bbox: [510, 90, 910, 145], order: 1 }],
      lines: [L(1, [520, 100, 900, 140]), L(2, [600, 130, 800, 170], stream)],
    })
    const { container, unmount } = setup({ base: withEdge('sep') })
    expect(container.querySelector('[data-straddle]')).toBeNull()
    expect(screen.queryByTestId('straddle-note')).toBeNull()
    unmount()
    const second = setup({ base: withEdge('notes') })
    expect(second.container.querySelector('[data-straddle="2"]')).toBeInTheDocument()
    expect(screen.getByTestId('straddle-note')).toHaveTextContent(/שורה אחת בולטת/)
  })

  it('שורות מחוץ לכל מסגרת מסומנות, ו"✓ המסגרות נכונות" שואל לפני האישור', async () => {
    const base = {
      ...doc(),
      frames: [
        { fid: 'aa11bb', stream: 'main', bbox: [510, 90, 910, 200], order: 1 },
        { fid: 'cc22dd', stream: 'main', bbox: [90, 90, 490, 150], order: 2 },
      ],
    }
    const { log, container } = setup({ base })
    expect(container.querySelector('[data-outside="4"]')).toBeInTheDocument()
    expect(screen.getByTestId('outside-note')).toHaveTextContent(/שורה אחת מחוץ לכל מסגרת/)
    await userEvent.click(screen.getByRole('button', { name: /המסגרות נכונות/ }))
    expect(log.groups).toHaveLength(0)
    const ask = screen.getByRole('alert')
    expect(ask).toHaveTextContent(/לאשר בכל זאת/)
    await userEvent.click(within(ask).getByRole('button', { name: 'ביטול' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(log.groups).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: /המסגרות נכונות/ }))
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'כן, לאשר' }))
    expect(log.errors).toEqual([])
    expect(log.groups).toHaveLength(1)
    expect(log.groups[0][0]).toMatchObject({ kind: 'frames_set', value: { confirmed: true } })
  })

  it('לחיצה מחוץ ללוח סוגרת את חלונית-המסגרת; Esc סוגר אותה (גם מרשימה בחלונית) ומסמן שטופל', () => {
    setup()
    click(700, 120)
    expect(screen.getByTestId('frame-popover')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()

    click(700, 120)
    const kind = within(screen.getByTestId('frame-popover')).getByRole('combobox', { name: 'סוג המסגרת' })
    // fireEvent מחזיר false כשהאירוע בוטל (preventDefault) — חלון-הסקירה של המנהל לא נסגר איתו
    expect(fireEvent.keyDown(kind, { key: 'Escape' })).toBe(false)
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    // אין מה לסגור — Esc ממשיך הלאה
    expect(fireEvent.keyDown(screen.getByTestId('scan-panel'), { key: 'Escape' })).toBe(true)
  })

  it('אחרי לחיצה על הסריקה המקלדת חוזרת ללוח, גם כשהעורך "חטף" את המיקוד', async () => {
    const editor = document.createElement('div')
    editor.tabIndex = 0
    document.body.appendChild(editor)
    try {
      const onPick = vi.fn(() => editor.focus())
      setup({ onPick })
      click(700, 170)
      expect(onPick).toHaveBeenCalledWith(2)
      expect(document.activeElement).toBe(editor)
      await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('scan-panel')))
      // עכשיו Delete מוחק את המסגרת שנבחרה, ולא אות בטקסט
      expect(screen.getByTestId('frame-popover')).toBeInTheDocument()
    } finally {
      editor.remove()
    }
  })

  it('שורה חדשה קטנה מ-8×6 פיקסלים בסריקה — הודעה ובלי פעולה (תוכנת-הספר הייתה דוחה אותה)', async () => {
    window.localStorage.setItem('pageProof.scanZoom', JSON.stringify({ fit: false, zoom: 2 }))
    const { log } = setup({ initialMode: 'lines' })
    await userEvent.click(screen.getByRole('button', { name: 'שורה חדשה' }))
    // בזום 2: 10 פיקסלי-מסך = 5 פיקסלי-תמונה
    fireEvent.pointerDown(svgOf(), { button: 0, clientX: 200, clientY: 800, pointerId: 1 })
    fireEvent.pointerMove(svgOf(), { clientX: 960, clientY: 810, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: 960, clientY: 810, pointerId: 1 })
    expect(log.groups).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(/קטנה מדי/)
  })

  it('פיצול שורה שהתיבה שלה שונתה, מחוץ לתיבה המקורית — הסבר למה נדחה', async () => {
    const { log, container } = setup({ initialMode: 'lines' })
    click(700, 120)
    const nw = container.querySelector('[data-handle="nw"][data-line="1"]')
    fireEvent.pointerDown(nw, { button: 0, clientX: 520, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(svgOf(), { clientX: 450, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: 450, clientY: 100, pointerId: 1 })
    expect(log.groups[0]).toEqual([{ kind: 'bbox', page: 3, ids: [1], value: [450, 100, 900, 140] }])
    await userEvent.click(screen.getByRole('button', { name: 'פיצול' }))
    click(490, 120)
    expect(log.groups).toHaveLength(1)
    expect(log.errors).toEqual([expect.stringMatching(/מחוץ לשורה/)])
    expect(screen.getByRole('status')).toHaveTextContent(/כבר שיניתם את התיבה/)
  })
})

describe('ScanPanel — זרם המסגרת: כותרות וריהוט הדף', () => {
  const drawBar = () => screen.getByRole('group', { name: 'הזרם של המסגרת החדשה' })
  const draw = (x0, y0, x1, y1) => {
    fireEvent.pointerDown(svgOf(), { button: 0, clientX: x0, clientY: y0, pointerId: 1 })
    fireEvent.pointerMove(svgOf(), { clientX: x1, clientY: y1, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: x1, clientY: y1, pointerId: 1 })
  }
  const lastFrames = (log) => log.groups[log.groups.length - 1][0].value.frames

  it('"מסגרת חדשה" מציעה כותרת לכל זרם-תוכן ("כותרת", "כותרת הערות") ו"ריהוט הדף"', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'מסגרת חדשה' }))
    const g = drawBar()
    for (const name of ['ראשי', 'הערות', 'כותרת', 'כותרת הערות', 'ריהוט הדף']) expect(within(g).getByRole('button', { name })).toBeInTheDocument()
    expect(within(g).getByRole('button', { name: 'ראשי', pressed: true })).toBeInTheDocument()
  })

  it('מסגרת "כותרת הערות": נשמרת בזרם notes_heading, והשורה שבתוכה עוברת לזרם-הכותרת', async () => {
    const { log } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'מסגרת חדשה' }))
    await userEvent.click(within(drawBar()).getByRole('button', { name: 'כותרת הערות' }))
    draw(505, 95, 915, 145)
    expect(log.errors).toEqual([])
    const added = lastFrames(log).find((f) => f.stream === 'notes_heading')
    expect(added).toMatchObject({ bbox: [516, 96, 904, 144] })
    expect(log.view.lines.find((l) => l.id === 1)).toMatchObject({ stream: 'notes_heading', stream_src: 'frame' })
    expect(screen.getAllByTestId('frame-badge').map((b) => b.textContent)).toContain('2הערות — כותרת 1')
    // בחלונית (נפתחת בלחיצה על המסגרת החדשה — היא הקטנה שבנקודה): הכותרת פעילה
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    click(700, 120)
    expect(within(screen.getByTestId('frame-popover')).getByRole('button', { name: 'כותרת הערות', pressed: true })).toBeInTheDocument()
  })

  it('"ריהוט הדף": בראש העמוד — כותרת עמוד, בתחתיתו — תחתית; מלשונית-הריהוט בטקסט זו הבחירה ההתחלתית', async () => {
    const { log } = setup({ tab: FURNITURE_TAB })
    await userEvent.click(screen.getByRole('button', { name: 'מסגרת חדשה' }))
    expect(within(drawBar()).getByRole('button', { name: 'ריהוט הדף', pressed: true })).toBeInTheDocument()
    draw(400, 20, 600, 70)
    expect(log.errors).toEqual([])
    expect(lastFrames(log).find((f) => f.bbox[1] === 20)).toMatchObject({ stream: 'header', bbox: [400, 20, 600, 70] })
    await userEvent.click(screen.getByRole('button', { name: 'מסגרת חדשה' }))
    draw(450, 900, 550, 960)
    expect(log.errors).toEqual([])
    expect(lastFrames(log).find((f) => f.bbox[1] === 900)).toMatchObject({ stream: 'footer' })
  })

  it('בחלונית: "ריהוט הדף" מעביר מסגרת קיימת לריהוט לפי מקומה, ו"כותרת" — לזרם-הכותרת', async () => {
    const { log } = setup()
    click(500, 820)
    const pop = () => screen.getByTestId('frame-popover')
    await userEvent.click(within(pop()).getByRole('button', { name: 'ריהוט הדף' }))
    expect(log.errors).toEqual([])
    expect(lastFrames(log).map((f) => f.stream)).toEqual(['main', 'main', 'footer'])
    expect(log.view.lines.find((l) => l.id === 4).stream).toBe('footer')
    click(700, 120)
    await userEvent.click(within(pop()).getByRole('button', { name: 'כותרת' }))
    expect(lastFrames(log).map((f) => f.stream)).toEqual(['main_heading', 'main', 'footer'])
    expect(log.view.lines.find((l) => l.id === 2).stream).toBe('main_heading')
  })
})

describe('ScanPanel — החלונית, הידיות וההתהדקות לטקסט', () => {
  const handle = (container, h, fid) => container.querySelector(`[data-handle="${h}"]${fid ? `[data-fid="${fid}"]` : ''}`)
  const dragEl = (el, [x0, y0], [x1, y1]) => {
    fireEvent.pointerDown(el, { button: 0, clientX: x0, clientY: y0, pointerId: 1 })
    fireEvent.pointerMove(svgOf(), { clientX: x1, clientY: y1, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: x1, clientY: y1, pointerId: 1 })
  }
  const rightFrame = (log) => log.groups[log.groups.length - 1][0].value.frames.find((f) => f.bbox[3] === 194)

  it('החלונית ליד המסגרת ולא עליה; "סגירה" סוגרת רק אותה — הידיות נשארות, ולחיצה על המסגרת פותחת שוב', async () => {
    const { container } = setup()
    click(700, 120)
    const ov = screen.getByTestId('scan-overlay')
    expect(ov).toContainElement(screen.getByTestId('frame-popover'))
    // המסגרת הימנית [516, 96, 904, 194]: החלונית משמאלה, 12 פיקסלים מהקו
    expect(ov.getAttribute('data-side')).toBe('left')
    expect(parseFloat(ov.style.left) + 300).toBe(516 - 12)
    await userEvent.click(within(screen.getByTestId('frame-popover')).getByRole('button', { name: 'סגירה' }))
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(8)
    // לחיצה על ידית בלי גרירה לא פותחת אותה
    const w = handle(container, 'w')
    fireEvent.pointerDown(w, { button: 0, clientX: 516, clientY: 145, pointerId: 1 })
    fireEvent.pointerUp(svgOf(), { clientX: 516, clientY: 145, pointerId: 1 })
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    click(700, 170)
    expect(screen.getByTestId('frame-popover')).toBeInTheDocument()
  })

  it('שינוי-גודל בידית-צלע ובהזזה: המסגרת מתהדקת לשורות שמרכזן בפנים, ולא גדלה מעבר למה שנגרר', () => {
    const { log, container } = setup()
    click(700, 120)
    // הרחבה שמאלה עד 300 — אין שורה חדשה שמרכזה בפנים: המסגרת מתהדקת חזרה, בלי פעולה
    dragEl(handle(container, 'w'), [516, 145], [300, 145])
    expect(log.groups).toHaveLength(0)
    expect(screen.getByTestId('frame-popover')).toBeInTheDocument()
    // עד 200 — מרכז הטור השמאלי בפנים: עד 200 בדיוק (לא עד 96, קצה השורה)
    dragEl(handle(container, 'w'), [516, 145], [200, 145])
    expect(log.errors).toEqual([])
    expect(rightFrame(log).bbox).toEqual([200, 96, 904, 194])
    // הזזה ימינה ב-30: הצד הימני מתהדק חזרה לטקסט (904), הצד השמאלי — כפי שהוזז
    dragEl(svgOf(), [700, 120], [730, 120])
    expect(rightFrame(log).bbox).toEqual([230, 96, 904, 194])
    // ידית-צלע עליונה — רק הצלע העליונה, ומתהדקת לשורה
    dragEl(handle(container, 'n'), [567, 96], [567, 60])
    expect(log.groups).toHaveLength(2)
    expect(screen.getByTestId('frame-popover')).toBeInTheDocument()
  })

  it('אחרי "סגירה": שינוי-גודל והזזה של המסגרת אינם פותחים את החלונית שוב (רק לחיצה על המסגרת)', async () => {
    const { log, container } = setup()
    click(700, 120)
    await userEvent.click(within(screen.getByTestId('frame-popover')).getByRole('button', { name: 'סגירה' }))
    dragEl(handle(container, 'w'), [516, 145], [200, 145])
    expect(log.errors).toEqual([])
    expect(log.groups).toHaveLength(1)
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    // עדיין בחורה — עם הידיות
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(8)
    dragEl(svgOf(), [700, 120], [730, 120])
    expect(log.groups).toHaveLength(2)
    expect(rightFrame(log).bbox).toEqual([230, 96, 904, 194])
    expect(screen.queryByTestId('frame-popover')).not.toBeInTheDocument()
    click(700, 170)
    expect(screen.getByTestId('frame-popover')).toBeInTheDocument()
  })

  it('מצב "שורות": לשורה נבחרת ידיות בצדדים — ידית-צלע משנה צלע אחת', () => {
    const { log, container } = setup({ initialMode: 'lines' })
    click(700, 120)
    expect(container.querySelectorAll('[data-handle][data-line="1"]')).toHaveLength(8)
    dragEl(container.querySelector('[data-handle="e"][data-line="1"]'), [900, 120], [950, 135])
    expect(log.groups).toEqual([[{ kind: 'bbox', page: 3, ids: [1], value: [520, 100, 950, 140] }]])
  })

  it('המילה של הסמן מודגשת על הסריקה (currentWord)', () => {
    const base = { ...doc(), lines: [L(1, [520, 100, 900, 140], 'main', { words: [{ text: 'שורה', bbox: [700, 100, 900, 140] }, { text: '1', bbox: [520, 100, 680, 140] }] }), ...doc().lines.slice(1)] }
    const { container } = setup({ base, currentWord: 1 })
    const hl = container.querySelector('[data-testid="word-highlight"]')
    expect(hl.getAttribute('x')).toBe('520')
    expect(hl.getAttribute('width')).toBe('160')
  })
})

describe('ScanPanel — זום', () => {
  it('הגדלה/הקטנה ו"רוחב" נשמרים בהעדפות', async () => {
    setup()
    expect(screen.getByText('100%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /הגדלה/ }))
    expect(screen.getByText('125%')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('pageProof.scanZoom'))).toEqual({ fit: false, zoom: 1.25 })
    await userEvent.click(screen.getByRole('button', { name: 'רוחב' }))
    expect(JSON.parse(window.localStorage.getItem('pageProof.scanZoom')).fit).toBe(true)
    expect(screen.getByRole('button', { name: 'רוחב', pressed: true })).toBeInTheDocument()
  })
})

describe('ScanPanel — "השורה שייכת למסגרת הזו" (שורה שבולטת מהמסגרת)', () => {
  // מסגרת שמורה [510, 90, 910, 200]; שורה 2 בולטת ממנה ימינה (עד 930), שורה 1 בתוכה
  const base = () => ({
    ...doc(),
    frames: [{ fid: 'aa11bb', stream: 'main', bbox: [510, 90, 910, 200], order: 1 }],
    lines: [L(1, [520, 100, 900, 140]), L(2, [520, 150, 930, 190]), L(3, [100, 100, 480, 140]), L(4, [100, 800, 900, 840], 'notes')],
  })
  const STREAM_OP = [{ kind: 'stream', page: 3, ids: [2], value: 'main' }]

  it('הסמן על שורה בולטת: הסבר וכפתור; הלחיצה — פעולת stream אחת לפי המסגרת, והסימון האדום יורד', async () => {
    const { log, container } = setup({ base: base(), current: 2 })
    expect(container.querySelector('[data-straddle="2"]')).toBeInTheDocument()
    const bar = screen.getByTestId('straddle-claim')
    expect(bar).toHaveTextContent('השורה שבסמן בולטת מהמסגרת «ראשי 1»')
    await userEvent.click(within(bar).getByRole('button', { name: 'השורה שייכת למסגרת הזו' }))
    expect(log.errors).toEqual([])
    expect(log.groups).toEqual([STREAM_OP])
    expect(log.view.lines.find((l) => l.id === 2)).toMatchObject({ stream: 'main', stream_src: 'human' })
    expect(container.querySelector('[data-straddle="2"]')).toBeNull()
    expect(screen.queryByTestId('straddle-note')).toBeNull()
    expect(screen.queryByTestId('straddle-claim')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('השורה שויכה למסגרת «ראשי 1»')
  })

  it('לשורה שאינה בולטת — אין כפתור; ההסבר הכללי מזכיר גם פיצול והגדלת המסגרת', () => {
    setup({ base: base(), current: 1 })
    expect(screen.queryByTestId('straddle-claim')).toBeNull()
    const note = screen.getByTestId('straddle-note')
    expect(note).toHaveTextContent(/מפצלים אותה במצב "שורות"/)
    expect(note).toHaveTextContent(/הגדילו את המסגרת/)
    expect(note).toHaveTextContent(/«השורה שייכת למסגרת\s+הזו»/)
  })

  it('גם בחלונית של המסגרת שהשורה שבסמן בולטת ממנה', async () => {
    const { log } = setup({ base: base(), current: 2 })
    click(700, 120)
    const row = within(screen.getByTestId('frame-popover')).getByTestId('popover-claim')
    await userEvent.click(within(row).getByRole('button', { name: 'השורה שייכת למסגרת הזו' }))
    expect(log.groups).toEqual([STREAM_OP])
  })

  it('במצב "שורות": לשורה בולטת שנבחרה — "שייכת למסגרת «ראשי 1»"', async () => {
    const { log } = setup({ base: base(), initialMode: 'lines' })
    click(925, 170) // החלק שמחוץ למסגרת
    await userEvent.click(screen.getByRole('button', { name: 'שייכת למסגרת «ראשי 1»' }))
    expect(log.groups).toEqual([STREAM_OP])
    // שורה שאינה בולטת — בלי הכפתור
    click(700, 120)
    expect(screen.queryByRole('button', { name: /שייכת למסגרת/ })).toBeNull()
  })

  it('תצוגה בלבד — בלי הפעולה', () => {
    setup({ base: base(), current: 2, readOnly: true })
    expect(screen.queryByTestId('straddle-claim')).toBeNull()
  })
})
