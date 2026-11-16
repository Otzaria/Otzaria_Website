import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef, useState } from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import TextEditor from '../TextEditor'
import PageReportsLayer from './PageReportsLayer'
import { usePageReports } from './usePageReports'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  // ב-jsdom אין execCommand — applyFieldEdit עובר למסלול הגיבוי (עדכון ה-state), כמו בדפדפן שלא תומך
  document.execCommand = vi.fn(() => false)
})

const TEXT = 'אמר רבי יהודה בשם רב'

/** החיווט של עורך העמוד: TextEditor (תצוגת קוד) + usePageReports + PageReportsLayer */
function Harness({ submit, flushSave = vi.fn(), canReportErrors = true, online = true, initial = TEXT, scanCropFor }) {
  const [content, setContent] = useState(initial)
  const ref = useRef(null)
  const reports = usePageReports({ containerRef: ref })
  return (
    <>
      <TextEditor
        ref={ref}
        content={content}
        handleAutoSave={setContent}
        setActiveTextarea={() => {}}
        setTextZoom={() => {}}
        textZoom={16}
        textView="code"
        onFieldContextMenu={reports.onFieldContextMenu}
      />
      <PageReportsLayer
        {...reports.layerProps}
        bookPath="ספר"
        pageNumber={7}
        canReportErrors={canReportErrors}
        online={online}
        applyColumnText={(_column, text) => setContent(text)}
        flushSave={flushSave}
        submit={submit}
        scanCropFor={scanCropFor}
      />
    </>
  )
}

function rightClick(el, init = {}) {
  return fireEvent.contextMenu(el, { clientX: 400, clientY: 200, ...init })
}

describe('תפריט הלחיצה הימנית ודיווח על טעות', () => {
  it('לחיצה ימנית פותחת את התפריט שלנו; עם Shift — התפריט של הדפדפן', () => {
    render(<Harness submit={vi.fn()} />)
    const field = screen.getByRole('textbox')
    expect(rightClick(field, { shiftKey: true, button: 2 })).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(rightClick(field)).toBe(false)
    const menu = screen.getByRole('menu', { name: 'פעולות על הטקסט' })
    // בלי שורת הסבר על Shift בתחתית התפריט (ההתנהגות עצמה נשארת)
    expect(menu).not.toHaveTextContent('Shift')
    for (const name of ['דווח על טעות בספר המודפס', 'הודעה למנהלים על העמוד', 'גזור', 'העתק', 'הדבק']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('Shift+F10 (מקלדת: shiftKey בלי לחצן ימני) פותח את התפריט שלנו', () => {
    render(<Harness submit={vi.fn()} />)
    const field = screen.getByRole('textbox')
    expect(rightClick(field, { shiftKey: true, button: 0 })).toBe(false)
    expect(screen.getByRole('menu', { name: 'פעולות על הטקסט' })).toBeInTheDocument()
  })

  it('הטקסט שלפני הבחירה השתנה בזמן שהחלון פתוח — לא נשלח ולא מסומן', async () => {
    const submit = vi.fn().mockResolvedValue({ _id: '1' })
    render(<Harness submit={submit} initial="רב רב" />)
    const field = screen.getByRole('textbox')
    field.focus()
    field.setSelectionRange(3, 5)
    rightClick(field)
    fireEvent.click(screen.getByRole('menuitem', { name: 'דווח על טעות בספר המודפס' }))
    fireEvent.change(screen.getByLabelText('התיקון המוצע'), { target: { value: 'רבא' } })
    // בטווח הנבחר עדיין "רב" — אבל מה שלפניו השתנה, ולכן ה-offset כבר לא מהימן
    fireEvent.change(field, { target: { value: 'אב רב' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' })) })
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText(/הטקסט בעורך השתנה מאז שסימנתם/)).toBeInTheDocument()
    expect(field).toHaveValue('אב רב')
  })

  it('Escape סוגר ומחזיר את הפוקוס לשדה', async () => {
    render(<Harness submit={vi.fn()} />)
    const field = screen.getByRole('textbox')
    field.focus()
    field.setSelectionRange(4, 7)
    rightClick(field)
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'דווח על טעות בספר המודפס' })).toHaveFocus())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(field).toHaveFocus()
    expect([field.selectionStart, field.selectionEnd]).toEqual([4, 7])
  })

  it('לא מורשה: "דווח על טעות" מושבת עם הסבר', () => {
    render(<Harness submit={vi.fn()} canReportErrors={false} />)
    rightClick(screen.getByRole('textbox'))
    const item = screen.getByRole('menuitem', { name: 'דווח על טעות בספר המודפס' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveAccessibleDescription(/תפס את העמוד/)
  })

  it('אזור הצילום: מחושב לפי הבחירה ונשלח; חישוב שנכשל או פגום — הדיווח נשלח בלעדיו', async () => {
    const crop = { x: 0.1, y: 0.2, w: 0.8, h: 0.05, source: 'layout', level: 'line' }
    for (const [scanCropFor, expected] of [
      [vi.fn(() => crop), { ...crop, mark: null }],
      [vi.fn(() => { throw new Error('boom') }), null],
      [vi.fn(() => ({ x: 5 })), null],
    ]) {
      const submit = vi.fn().mockResolvedValue({ _id: 'r1' })
      const { unmount } = render(<Harness submit={submit} scanCropFor={scanCropFor} />)
      const field = screen.getByRole('textbox')
      field.focus()
      field.setSelectionRange(10, 10)
      rightClick(field)
      fireEvent.click(screen.getByRole('menuitem', { name: 'דווח על טעות בספר המודפס' }))
      fireEvent.change(await screen.findByLabelText('התיקון המוצע'), { target: { value: 'יהודא' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' })) })
      expect(scanCropFor).toHaveBeenCalledWith('content', TEXT, 8, 13)
      expect(submit).toHaveBeenCalledTimes(1)
      expect(submit.mock.calls[0][0].cropRect).toEqual(expected)
      unmount()
    }
  })

  it('בלי בחירה — המילה שתחת הסמן; שליחה מוצלחת מחליפה בסימון ושומרת', async () => {
    const submit = vi.fn().mockResolvedValue({ _id: 'r1' })
    const flushSave = vi.fn()
    render(<Harness submit={submit} flushSave={flushSave} />)
    const field = screen.getByRole('textbox')
    field.focus()
    field.setSelectionRange(10, 10) // בתוך "יהודה"
    rightClick(field)
    fireEvent.click(screen.getByRole('menuitem', { name: 'דווח על טעות בספר המודפס' }))

    const proposed = await screen.findByLabelText('התיקון המוצע')
    expect(screen.getByLabelText('הטקסט שבספר')).toHaveValue('יהודה')
    fireEvent.change(proposed, { target: { value: 'יהודא' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' })) })

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toMatchObject({
      kind: 'book_error', bookPath: 'ספר', pageNumber: 7, column: 'content',
      original: 'יהודה', proposed: 'יהודא', offset: 8,
      contextBefore: 'אמר רבי ', contextAfter: ' בשם רב',
    })
    await waitFor(() => expect(field).toHaveValue('אמר רבי (יהודה) [יהודא] בשם רב'))
    expect(flushSave).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('הדיווח נשלח למנהלים, והסימון נוסף לטקסט')).toBeInTheDocument()
  })

  it('שליחה שנכשלה — הטקסט לא משתנה והשגיאה מוצגת', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('נשלחו דיווחים רבים בזמן קצר. נסו שוב מאוחר יותר.'))
    const flushSave = vi.fn()
    render(<Harness submit={submit} flushSave={flushSave} />)
    const field = screen.getByRole('textbox')
    field.focus()
    field.setSelectionRange(8, 13)
    rightClick(field)
    fireEvent.click(screen.getByRole('menuitem', { name: 'דווח על טעות בספר המודפס' }))
    fireEvent.change(await screen.findByLabelText('התיקון המוצע'), { target: { value: 'יהודא' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' })) })
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('נשלחו דיווחים רבים')
    expect(field).toHaveValue(TEXT)
    expect(flushSave).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('ולידציה בעברית לפני השליחה — בלי בקשה לשרת', async () => {
    const submit = vi.fn()
    render(<Harness submit={submit} />)
    const field = screen.getByRole('textbox')
    field.focus()
    field.setSelectionRange(8, 13)
    rightClick(field)
    fireEvent.click(screen.getByRole('menuitem', { name: 'דווח על טעות בספר המודפס' }))
    await screen.findByLabelText('התיקון המוצע')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' })) })
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('התיקון המוצע זהה לטקסט שבספר')
    expect(submit).not.toHaveBeenCalled()
  })

  it('הודעה למנהלים — נשלחת עם kind: message', async () => {
    const submit = vi.fn().mockResolvedValue({ _id: 'm1' })
    render(<Harness submit={submit} />)
    rightClick(screen.getByRole('textbox'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'הודעה למנהלים על העמוד' }))
    fireEvent.change(await screen.findByLabelText('ההודעה'), { target: { value: 'הצילום חתוך' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'שליחה' })) })
    expect(submit).toHaveBeenCalledWith({ kind: 'message', bookPath: 'ספר', pageNumber: 7, message: 'הצילום חתוך' })
    expect(await screen.findByText('ההודעה נשלחה למנהלים')).toBeInTheDocument()
  })

  it('הדבקה שנכשלה — הודעה שמסבירה להשתמש ב-Ctrl+V', async () => {
    const original = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: vi.fn().mockRejectedValue(new Error('no')) } })
    try {
      render(<Harness submit={vi.fn()} />)
      rightClick(screen.getByRole('textbox'))
      await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'הדבק' })) })
      expect(await screen.findByText(/Ctrl\+V/)).toBeInTheDocument()
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original })
    }
  })

  it('העתקה כותבת ללוח את הבחירה', async () => {
    const original = navigator.clipboard
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      render(<Harness submit={vi.fn()} />)
      const field = screen.getByRole('textbox')
      field.focus()
      field.setSelectionRange(0, 3)
      rightClick(field)
      await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'העתק' })) })
      expect(writeText).toHaveBeenCalledWith('אמר')
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original })
    }
  })
})

describe('בלי onFieldContextMenu (העורך הלא-מקוון)', () => {
  it('התפריט הרגיל של הדפדפן — האירוע לא נחסם', () => {
    render(
      <TextEditor content="שלום" handleAutoSave={() => {}} setActiveTextarea={() => {}} setTextZoom={() => {}} textZoom={16} textView="code" />
    )
    expect(rightClick(screen.getByRole('textbox'))).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
