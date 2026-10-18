import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DonateWidget, { NEDARIM_WIDGET_HEIGHT, NEDARIM_WIDGET_SRC } from './DonateWidget'

afterEach(() => vi.useRealTimers())

it('ה-iframe נשאר כמו שהיה: כתובת, כותרת, רוחב מלא, 1700px, בלי מסגרת', () => {
  render(<DonateWidget title="התרומה באמצעות נדרים פלוס" />)
  const frame = screen.getByTitle('Nedarim Plus Widget') as HTMLIFrameElement
  expect(NEDARIM_WIDGET_SRC).toBe('https://nedar.im/ezOd')
  expect(frame.getAttribute('src')).toBe('https://nedar.im/ezOd')
  expect(frame.style.width).toBe('100%')
  expect(frame.style.height).toBe('1700px')
  expect(frame.style.borderStyle || frame.style.border).toMatch(/none/)
  expect(screen.getByText('התרומה באמצעות נדרים פלוס')).toBeTruthy()
})

it('שומר את גובה האזור מראש, כדי שלא תהיה קפיצת תוכן', () => {
  render(<DonateWidget title="t" />)
  const frame = screen.getByTitle('Nedarim Plus Widget')
  expect(NEDARIM_WIDGET_HEIGHT).toBe('1700px')
  expect((frame.parentElement as HTMLElement).style.minHeight).toBe('1700px')
})

it('מחוון הטעינה מוצג מאחורי ה-iframe ויורד כשהוא נטען', () => {
  // ב-jsdom ה-iframe באותו מקור (contentDocument קיים) — כמו iframe שעוד לא הגיע לנדרים
  render(<DonateWidget title="t" />)
  const frame = screen.getByTitle('Nedarim Plus Widget')
  const status = screen.getByRole('status')
  expect(status.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(frame.className).not.toContain('opacity-0')
  fireEvent.load(frame)
  expect(screen.queryByRole('status')).toBeNull()
})

it('מסיר את המחוון אחרי זמן גם כשאירוע load לא הגיע', () => {
  vi.useFakeTimers()
  render(<DonateWidget title="t" />)
  expect(screen.getByRole('status')).toBeTruthy()
  act(() => { vi.advanceTimersByTime(14999) })
  expect(screen.getByRole('status')).toBeTruthy()
  act(() => { vi.advanceTimersByTime(1) })
  expect(screen.queryByRole('status')).toBeNull()
})

it('מזהה iframe שנטען לפני ההידרציה (מסמך חוצה-מקור)', () => {
  const spy = vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(null)
  render(<DonateWidget title="t" />)
  expect(screen.queryByRole('status')).toBeNull()
  spy.mockRestore()
})

it('מזהה iframe חוצה-מקור גם כשהגישה ל-contentDocument זורקת', () => {
  const spy = vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockImplementation(() => { throw new Error('SecurityError') })
  render(<DonateWidget title="t" />)
  expect(screen.queryByRole('status')).toBeNull()
  spy.mockRestore()
})
