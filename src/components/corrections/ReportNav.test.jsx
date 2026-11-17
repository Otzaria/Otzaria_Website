import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import ReportNav from './ReportNav'
import { NAV_KEY, FILTERS_KEY } from '@/lib/corrections/queue-nav'

const saveNav = (ids, total = ids.length, query = 'view=queued') =>
  sessionStorage.setItem(NAV_KEY, JSON.stringify({ query, ids, total, at: Date.now() }))
const hrefOf = (name) => screen.getByRole('link', { name }).getAttribute('href')

describe('מעבר בין דיווחים', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [], total: 0 }) })))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('באמצע הרשימה: הקודם והבא לפי הסדר, ומיקום', () => {
    saveNav(['a', 'b', 'c'])
    render(<ReportNav id="b" />)
    expect(hrefOf(/הקודם/)).toBe('/library/corrections/a')
    expect(hrefOf(/הבא/)).toBe('/library/corrections/c')
    expect(screen.getByText('2 מתוך 3')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('בתחילת הרשימה ובסופה הכפתור המתאים מושבת', () => {
    saveNav(['a', 'b'])
    render(<ReportNav id="a" />)
    const prev = screen.getByRole('link', { name: /הקודם/ })
    expect(prev.getAttribute('aria-disabled')).toBe('true')
    expect(prev.hasAttribute('href')).toBe(false)
    cleanup()
    render(<ReportNav id="b" />)
    const next = screen.getByRole('link', { name: /הבא/ })
    expect(next.getAttribute('aria-disabled')).toBe('true')
    expect(next.hasAttribute('href')).toBe(false)
  })

  it('האחרון שנטען כשבשרת יש עוד: טוען את העמוד הבא לפי אותה שאילתה', async () => {
    saveNav(['a', 'b'], 5, 'view=mine')
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'c' }, { id: 'd' }], total: 5 }) })
    render(<ReportNav id="b" />)
    await waitFor(() => expect(hrefOf(/הבא/)).toBe('/library/corrections/c'))
    expect(fetch.mock.calls[0][0]).toContain('view=mine')
    expect(fetch.mock.calls[0][0]).toContain('skip=0') // חפיפה: מתחילים חצי עמוד אחורה
    expect(JSON.parse(sessionStorage.getItem(NAV_KEY)).ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('כניסה ישירה בלי רשימה שמורה: בונה מהסינון האחרון של התור', async () => {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ view: 'claimed' }))
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'x' }, { id: 'y' }], total: 2 }) })
    render(<ReportNav id="y" />)
    await waitFor(() => expect(hrefOf(/הקודם/)).toBe('/library/corrections/x'))
    expect(fetch.mock.calls[0][0]).toContain('view=claimed')
    expect(screen.getByText('2 מתוך 2')).toBeTruthy()
  })

  it('הדיווח אינו ברשימה: לא מוצג ניווט', async () => {
    saveNav(['a', 'b'])
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'a' }], total: 1 }) })
    const { container } = render(<ReportNav id="zzz" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})
