// "דיווחים על עמודים" מקצה לקצה (fetch מדומה לפי החוזה): טעינה לפי הכתובת, לשוניות ומונים, סינון מצב וספר בכתובת,
// הכרעה שמוציאה כרטיס מ"ממתין" ומעדכנת מונים, applyResult 'not_found', שגיאת 409 עם הודעת השרת, ו-403.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { COUNTS, errorReport, json, messageReport } from './testFixtures'

vi.mock('next/navigation', () => {
  const subscribe = (cb) => {
    window.addEventListener('test-url', cb)
    window.addEventListener('popstate', cb)
    return () => {
      window.removeEventListener('test-url', cb)
      window.removeEventListener('popstate', cb)
    }
  }
  return {
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  }
})
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))
for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}

import PageReportsScreen from './PageReportsScreen'

const SECOND = errorReport({ _id: 'r2', bookPath: 'shemot-raba', bookName: 'שמות רבה', pageNumber: 3, original: 'משה', proposed: 'משֶׁה', pageStatus: 'in-progress', canApply: false })

let calls
let list
let patch
beforeEach(() => {
  calls = []
  list = () => json({ success: true, reports: [errorReport(), SECOND], counts: COUNTS, total: 2, hasMore: false })
  patch = (body) => json({ success: true, report: { ...errorReport(), status: body.action === 'approve' ? 'approved' : 'rejected', appliedToText: body.applyToText ? 'proposed' : null, canApply: false }, applyResult: body.applyToText ? 'applied' : null })
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = String(input)
    const method = init?.method || 'GET'
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body) : undefined })
    if (method === 'GET' && url.startsWith('/api/admin/page-reports?')) return list(url)
    if (method === 'PATCH' && url.startsWith('/api/admin/page-reports/')) return patch(JSON.parse(init.body), url)
    return json({}, { status: 404 })
  }))
})

function renderAt(url) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><PageReportsScreen /></ToastProvider>)
}
const gets = () => calls.filter((c) => c.method === 'GET').map((c) => c.url)
const patches = () => calls.filter((c) => c.method === 'PATCH')
const cards = () => within(screen.getByRole('list', { name: 'טעויות בספר המודפס' })).getAllByRole('listitem')
const card = (bookName) => screen.getAllByRole('listitem').find((li) => within(li).queryByRole('heading')?.textContent.includes(bookName))

describe('דיווחים על עמודים — תצוגה', () => {
  test('ברירת מחדל: טעויות בספר שממתינות; לשוניות עם מונה הממתינים; מסנן מצב עם מונים', async () => {
    renderAt('/library/admin/page-reports')
    const list = await screen.findByRole('list', { name: 'טעויות בספר המודפס' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(gets()[0]).toBe('/api/admin/page-reports?kind=book_error&status=pending&skip=0&limit=30')
    const tabs = screen.getByRole('navigation', { name: 'סוג הדיווח' })
    expect(within(tabs).getByRole('link', { name: /טעויות בספר המודפס, 2 ממתינים/ })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: /הודעות על עמודים, אחד ממתין/ })).toHaveAttribute('href', '/library/admin/page-reports?kind=message')
    expect(document.body.textContent).not.toMatch(/תור|סטטוס/)
    await userEvent.setup().click(screen.getByRole('button', { name: /^מצב/ }))
    expect(screen.getAllByRole('option').map((o) => o.textContent.replace('check', ''))).toEqual(['ממתין2', 'אושר5', 'נדחה1', 'הכול8'])
    expect(screen.getByRole('option', { name: /ממתין/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('מצב וספר — בכתובת ובבקשה', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/page-reports')
    await screen.findByRole('list', { name: 'טעויות בספר המודפס' })
    await user.click(screen.getByRole('button', { name: /^מצב/ }))
    await user.click(screen.getByRole('option', { name: /אושר/ }))
    await waitFor(() => expect(window.location.search).toBe('?status=approved'))
    await waitFor(() => expect(gets().at(-1)).toBe('/api/admin/page-reports?kind=book_error&status=approved&skip=0&limit=30'))
    await screen.findByRole('list', { name: 'טעויות בספר המודפס' })
    await user.click(within(card('שמות רבה')).getByRole('button', { name: /הצג רק דיווחים על שמות רבה/ }))
    await waitFor(() => expect(window.location.search).toBe('?status=approved&book=shemot-raba'))
    await waitFor(() => expect(gets().at(-1)).toBe('/api/admin/page-reports?kind=book_error&status=approved&book=shemot-raba&skip=0&limit=30'))
  })

  test('לשונית ההודעות מהכתובת', async () => {
    list = () => json({ success: true, reports: [messageReport()], counts: COUNTS, total: 1 })
    renderAt('/library/admin/page-reports?kind=message&status=all')
    const l = await screen.findByRole('list', { name: 'הודעות על עמודים' })
    expect(within(l).getByText('חסרה שורה בסוף העמוד')).toBeInTheDocument()
    expect(gets()[0]).toBe('/api/admin/page-reports?kind=message&status=all&skip=0&limit=30')
    await userEvent.setup().click(screen.getByRole('button', { name: /^מצב/ }))
    expect(screen.getAllByRole('option').map((o) => o.textContent.replace('check', ''))).toEqual(['ממתין1', 'טופל3', 'הכול4'])
  })

  test('ריק', async () => {
    list = () => json({ success: true, reports: [], counts: { book_error: {}, message: {} }, total: 0 })
    renderAt('/library/admin/page-reports')
    expect(await screen.findByText('אין טעויות שממתינות')).toBeInTheDocument()
  })

  test('403 — "אין לך הרשאה"', async () => {
    list = () => json({ success: false, error: 'אין הרשאה' }, { status: 403 })
    renderAt('/library/admin/page-reports')
    expect(await screen.findByText('אין לך הרשאה לראות את המסך הזה')).toBeInTheDocument()
  })
})

describe('דיווחים על עמודים — הכרעה', () => {
  test('אישור בסינון "ממתין": הבקשה לפי החוזה, הכרטיס יוצא, המונים מתעדכנים', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/page-reports')
    await screen.findByRole('list', { name: 'טעויות בספר המודפס' })
    // אחרי האישור — הרענון השקט מחזיר רק את מה שנשאר
    const after = { success: true, reports: [SECOND], counts: { ...COUNTS, book_error: { pending: 1, approved: 6, rejected: 1 } }, total: 1 }
    list = () => json(after)
    await user.click(within(card('בראשית רבה')).getByRole('button', { name: /^אשר את התיקון/ }))
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(patches()[0]).toMatchObject({ url: '/api/admin/page-reports/r1', body: { action: 'approve' } })
    expect(screen.getByRole('link', { name: /טעויות בספר המודפס, אחד ממתין/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^מצב/ }))
    expect(screen.getByRole('option', { name: /אושר/ })).toHaveTextContent('אושר6')
    expect(await screen.findByText('התיקון אושר; טקסט העמוד לא השתנה — בראשית רבה, עמוד 12')).toBeInTheDocument()
  })



  test('409 — הודעת השרת בכרטיס, והכרטיס נשאר', async () => {
    const user = userEvent.setup()
    patch = () => json({ success: false, error: 'הטקסט השתנה בינתיים, נסו שוב' }, { status: 409 })
    renderAt('/library/admin/page-reports')
    await screen.findByRole('list', { name: 'טעויות בספר המודפס' })
    await user.click(within(card('בראשית רבה')).getByRole('button', { name: /דחה את התיקון/ }))
    expect(await within(card('בראשית רבה')).findByRole('alert')).toHaveTextContent('הטקסט השתנה בינתיים, נסו שוב')
    expect(cards()).toHaveLength(2)
  })

  test('הודעה: "סמן כטופל" — הבקשה, והכרטיס יוצא מ"ממתין"', async () => {
    const user = userEvent.setup()
    list = () => json({ success: true, reports: [messageReport()], counts: COUNTS, total: 1 })
    patch = () => json({ success: true, report: { ...messageReport(), status: 'handled' }, applyResult: null })
    renderAt('/library/admin/page-reports?kind=message')
    await screen.findByRole('list', { name: 'הודעות על עמודים' })
    list = () => json({ success: true, reports: [], counts: { ...COUNTS, message: { pending: 0, handled: 4 } }, total: 0 })
    await user.click(screen.getByRole('button', { name: /סמן כטופל/ }))
    expect(await screen.findByText('אין הודעות שממתינות')).toBeInTheDocument()
    expect(patches()[0]).toMatchObject({ url: '/api/admin/page-reports/m1', body: { action: 'handled' } })
  })
})
