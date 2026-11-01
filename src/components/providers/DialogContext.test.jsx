import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DialogProvider, useDialog } from './DialogContext'
import Dialog from '@/components/ui/Dialog'

function Harness({ onResult }) {
  const { showConfirm } = useDialog()
  const [open, setOpen] = useState(true)
  return open ? (
    <Dialog title="עריכה" onClose={() => setOpen(false)}>
      <input aria-label="שדה בחלון" />
      <button type="button" onClick={async () => onResult(await showConfirm('למחוק?', 'פעולה בלתי הפיכה'))}>
        מחק
      </button>
    </Dialog>
  ) : null
}

describe('DialogContext — חלון אישור', () => {
  it('נפתח כ-alertdialog מודאלי עם שם ותיאור, והפוקוס עובר אליו', async () => {
    const user = userEvent.setup()
    render(<DialogProvider><Harness onResult={vi.fn()} /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'מחק' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'למחוק?' })
    expect(confirm).toHaveAttribute('aria-modal', 'true')
    expect(confirm).toHaveAccessibleDescription('פעולה בלתי הפיכה')
    expect(confirm.contains(document.activeElement)).toBe(true)
  })

  it('מעל ui/Dialog — Tab מסתובב בתוך חלון האישור ולא בורח לחלון שמתחתיו', async () => {
    const user = userEvent.setup()
    render(<DialogProvider><Harness onResult={vi.fn()} /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'מחק' }))
    const confirm = await screen.findByRole('alertdialog')
    for (let i = 0; i < 5; i++) {
      await user.tab()
      expect(confirm.contains(document.activeElement)).toBe(true)
    }
    await user.tab({ shift: true })
    expect(confirm.contains(document.activeElement)).toBe(true)
  })

  it('Esc סוגר רק את חלון האישור (תוצאה false), והחלון שמתחתיו נשאר', async () => {
    const user = userEvent.setup()
    const onResult = vi.fn()
    render(<DialogProvider><Harness onResult={onResult} /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'מחק' }))
    await screen.findByRole('alertdialog')
    await user.keyboard('{Escape}')
    expect(onResult).toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog', { name: 'עריכה' })).toBeInTheDocument()
  })

  it('Enter על "ביטול" ממוקד — מבטל ולא מאשר', async () => {
    const user = userEvent.setup()
    const onResult = vi.fn()
    render(<DialogProvider><Harness onResult={onResult} /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'מחק' }))
    await screen.findByRole('alertdialog')
    act(() => screen.getByRole('button', { name: 'ביטול' }).focus())
    await user.keyboard('{Enter}')
    expect(onResult).toHaveBeenCalledWith(false)
  })

  it('Enter כשהפוקוס על החלון עצמו — מאשר (ההתנהגות הקיימת)', async () => {
    const user = userEvent.setup()
    const onResult = vi.fn()
    render(<DialogProvider><Harness onResult={onResult} /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'מחק' }))
    await screen.findByRole('alertdialog')
    await user.keyboard('{Enter}')
    expect(onResult).toHaveBeenCalledWith(true)
  })
})

function MessageHarness({ withReturnFocus }) {
  const { showMessage } = useDialog()
  return (
    <>
      <input aria-label="שדה שגוי" id="bad-field" />
      <button
        type="button"
        onClick={() => showMessage('שגיאה', 'חסר שדה', undefined, withReturnFocus
          ? { returnFocus: () => document.getElementById('bad-field') }
          : undefined)}
      >
        שלח
      </button>
    </>
  )
}

describe('DialogContext — showMessage', () => {
  it('returnFocus: בסגירה (אחרי שהחלון מוסר) הפוקוס עובר ליעד ולא לכפתור שפתח', async () => {
    const user = userEvent.setup()
    render(<DialogProvider><MessageHarness withReturnFocus /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'שלח' }))
    await screen.findByRole('alertdialog', { name: 'שגיאה' })
    await user.click(screen.getByRole('button', { name: 'אישור' }))
    // החלון מוסר אחרי טיימר של 300ms — זמן המתנה נדיב למכונה עמוסה
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), { timeout: 5000 })
    expect(screen.getByRole('textbox', { name: 'שדה שגוי' })).toHaveFocus()
  })

  it('בלי returnFocus — הפוקוס חוזר לכפתור שפתח', async () => {
    const user = userEvent.setup()
    render(<DialogProvider><MessageHarness /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'שלח' }))
    await screen.findByRole('alertdialog', { name: 'שגיאה' })
    await user.keyboard('{Escape}')
    // החלון מוסר אחרי טיימר של 300ms — זמן המתנה נדיב למכונה עמוסה
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), { timeout: 5000 })
    expect(screen.getByRole('button', { name: 'שלח' })).toHaveFocus()
  })
})

function ToastHarness({ onKey }) {
  const { showAlert } = useDialog()
  return (
    <>
      <textarea aria-label="עורך" onKeyDown={e => onKey(e.defaultPrevented)} />
      <button type="button" onClick={() => showAlert('נשמר', 'הדף נתפס')}>הצג</button>
    </>
  )
}

describe('DialogContext — הודעה חולפת (toast) אינה בולעת Enter', () => {
  it('Enter בשדה עריכה בזמן שה-toast מוצג — עובר כרגיל (בלי preventDefault)', async () => {
    const user = userEvent.setup()
    const seen = []
    // מאזין חלון שרץ אחרי ה-handler של הספק — בודק אם Enter נבלע
    const winListener = (e) => { if (e.key === 'Enter') seen.push(e.defaultPrevented) }
    render(<DialogProvider><ToastHarness onKey={vi.fn()} /></DialogProvider>)
    window.addEventListener('keydown', winListener)
    try {
      await user.click(screen.getByRole('button', { name: 'הצג' }))
      await screen.findByRole('status')
      const ta = screen.getByRole('textbox', { name: 'עורך' })
      await user.click(ta)
      await user.keyboard('א{Enter}ב')
      expect(seen).toEqual([false])
      expect(ta.value).toBe('א\nב')
      expect(screen.getByRole('status')).toBeInTheDocument()
    } finally {
      window.removeEventListener('keydown', winListener)
    }
  })

  it('Enter מחוץ לחלון אישור מודאלי אינו מאשר אותו', async () => {
    const onConfirm = vi.fn()
    function H() {
      const { showConfirm } = useDialog()
      return <button type="button" onClick={() => showConfirm('בטוח?', 'x', onConfirm)}>פתח</button>
    }
    const user = userEvent.setup()
    render(<DialogProvider><H /></DialogProvider>)
    await user.click(screen.getByRole('button', { name: 'פתח' }))
    await screen.findByRole('alertdialog')
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
