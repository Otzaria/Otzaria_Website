import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Dialog from './Dialog'

beforeEach(() => {
  // reduced-motion — הסגירה מיידית, בלי טיימר אנימציית היציאה
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
})

describe('Dialog', () => {
  it('role="dialog" מודאלי, עם שם מהכותרת ותיאור משורת המשנה; הפוקוס בחלון', () => {
    render(<Dialog title="הורדה" subtitle="בחר קובץ" onClose={() => {}}><button>א</button></Dialog>)
    const dialog = screen.getByRole('dialog', { name: 'הורדה' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('בחר קובץ')
    expect(dialog).toHaveFocus()
  })

  it('Esc וכפתור הסגירה קוראים ל-onClose', () => {
    const onClose = vi.fn()
    render(<Dialog title="הורדה" onClose={onClose}><p>תוכן</p></Dialog>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('Tab נלכד בתוך החלון: מהפקד האחרון חוזרים לראשון', () => {
    render(<Dialog title="ח" onClose={() => {}}><button>ראשון</button><button>אחרון</button></Dialog>)
    screen.getByRole('button', { name: 'אחרון' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'סגירה' })).toHaveFocus()
  })

  it('dismissible={false} — בלי כפתור סגירה, ו-Esc לא סוגר; footer מוצג', () => {
    const onClose = vi.fn()
    render(<Dialog title="אישור" onClose={onClose} dismissible={false} footer={<button>אישור</button>}><p>?</p></Dialog>)
    expect(screen.queryByRole('button', { name: 'סגירה' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'אישור' })).toBeInTheDocument()
  })

  describe('עם אנימציה (בלי reduced-motion)', () => {
    beforeEach(() => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    })

    it('הסגירה מחכה לסוף אנימציית היציאה של החלון (animationend), ו-onClose נקרא פעם אחת', () => {
      vi.useFakeTimers()
      try {
        const onClose = vi.fn()
        render(<Dialog title="הורדה" onClose={onClose}><p>תוכן</p></Dialog>)
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onClose).not.toHaveBeenCalled()
        const dialog = screen.getByRole('dialog')
        // סוף אנימציה של צאצא (מבעבע) — לא נחשב
        fireEvent.animationEnd(screen.getByText('תוכן'))
        expect(onClose).not.toHaveBeenCalled()
        fireEvent.animationEnd(dialog)
        expect(onClose).toHaveBeenCalledTimes(1)
        // רשת הביטחון לא קוראת שוב
        vi.runAllTimers()
        fireEvent.animationEnd(dialog)
        expect(onClose).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('בלי animationend (האנימציה לא רצה) — רשת הביטחון סוגרת', () => {
      vi.useFakeTimers()
      try {
        const onClose = vi.fn()
        render(<Dialog title="הורדה" onClose={onClose}><p>תוכן</p></Dialog>)
        fireEvent.click(screen.getByRole('button', { name: 'סגירה' }))
        expect(onClose).not.toHaveBeenCalled()
        vi.runAllTimers()
        expect(onClose).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('animationend של הכניסה (לפני בקשת סגירה) לא סוגר', () => {
      const onClose = vi.fn()
      render(<Dialog title="הורדה" onClose={onClose}><p>תוכן</p></Dialog>)
      fireEvent.animationEnd(screen.getByRole('dialog'))
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
