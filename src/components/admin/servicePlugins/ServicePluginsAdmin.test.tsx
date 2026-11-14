import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/Toast'

import ServicePluginsAdmin from './ServicePluginsAdmin'

function review(overrides: Record<string, unknown>) {
  return {
    id: 'r1', pluginId: 'p1', pluginName: 'שירות א', kind: 'service', status: 'pending_admin', pluginVersion: '1.0.0',
    serviceVersion: '1.0.0', ownerName: 'מפתח', createdAt: '2026-10-01T00:00:00Z', selectedAt: null, attempts: 0,
    nextAttemptAt: null, lastError: null, decision: null, cooldown: { blocked: false, nextAllowedAt: null },
    adminException: false, canRollback: false, ...overrides
  }
}

let adminBody: unknown
const defaultFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url === '/api/service-plugins/admin') return new Response(JSON.stringify(adminBody), { status: 200 })
  if (url.startsWith('/api/service-plugins/admin/') && init?.method === 'POST') return new Response('{"ok":true}', { status: 200 })
  return new Response('{}', { status: 404 })
}
const fetchSpy = vi.fn(defaultFetch)

beforeEach(() => {
  fetchSpy.mockClear()
  fetchSpy.mockImplementation(defaultFetch)
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

const renderAdmin = () => render(<ToastProvider><ServicePluginsAdmin /></ToastProvider>)

describe('ServicePluginsAdmin', () => {
  it('לשוניות עם מונים, השהיית בדיקות, ו"נכשל" עם הנחיה לאחראי השרת', async () => {
    adminBody = {
      control: { quotaPausedUntil: new Date(Date.now() + 3600_000).toISOString(), lock: null },
      reviews: [
        review({ id: 'a' }),
        review({ id: 'b', pluginId: 'p2', pluginName: 'שירות ב', status: 'needs_operator', lastError: { class: 'operator', code: 'gh_auth', message: 'לא מחובר' } })
      ]
    }
    renderAdmin()
    const tabs = await screen.findByRole('tablist', { name: 'ההגשות של תוספי השירות' })
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['לאישור (1)ממתין לאישור (1)', 'תקלה (1)נעצר בתקלה (1)', 'בבדיקה', 'טיוטה', 'סגור'])
    expect(screen.getByText(/הבדיקות מושהות עד/)).toBeInTheDocument()
    fireEvent.click(within(tabs).getByRole('tab', { name: 'נעצר בתקלה (1)' }))
    expect(await screen.findByText(/הבדיקה נעצרה בגלל תקלה אצלנו, לא בגלל התוסף/)).toBeInTheDocument()
    expect(screen.getByText('פרטים טכניים')).toBeInTheDocument()
    expect(screen.getByText('gh_auth')).toBeInTheDocument()
    expect(screen.getAllByText('נעצר בתקלה').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /נסה שוב/ })).toBeInTheDocument()
  })

  it('"אשר והתחל בדיקה" — חלון שמסביר שזה האישור לפרסום, ואז POST start', async () => {
    adminBody = { control: { quotaPausedUntil: null, lock: null }, reviews: [review({})] }
    renderAdmin()
    fireEvent.click(await screen.findByRole('button', { name: /אשר והתחל בדיקה/ }))
    const dialog = await screen.findByRole('dialog', { name: 'לאשר ולהתחיל בדיקה?' })
    expect(dialog).toHaveTextContent('האישור לפרסום')
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/service-plugins/admin/p1', expect.anything())
    fireEvent.click(within(dialog).getByRole('button', { name: 'אשר והתחל בדיקה' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/service-plugins/admin/p1', expect.objectContaining({ method: 'POST' })))
    const call = fetchSpy.mock.calls.find(([u]) => String(u) === '/api/service-plugins/admin/p1')!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ action: 'start', jobId: 'r1' })
  })

  it('פעולה שהופנתה להתחברות (התחברות שפגה) — הודעת שגיאה עם "התחבר", לא הצלחה', async () => {
    adminBody = { control: { quotaPausedUntil: null, lock: null }, reviews: [review({})] }
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/service-plugins/admin') return new Response(JSON.stringify(adminBody), { status: 200 })
      if (init?.method === 'POST') return { ok: false, status: 0, type: 'opaqueredirect', redirected: false } as unknown as Response
      return new Response('{}', { status: 404 })
    })
    renderAdmin()
    fireEvent.click(await screen.findByRole('button', { name: /אשר והתחל בדיקה/ }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'לאשר ולהתחיל בדיקה?' })).getByRole('button', { name: 'אשר והתחל בדיקה' }))
    expect(await screen.findByText('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument()
    expect(screen.queryByText(/הבדיקה התחילה/)).toBeNull()
  })

  it('21 יום — חריגת חירום דרך חלון עם סיבה', async () => {
    adminBody = { control: { quotaPausedUntil: null, lock: null }, reviews: [review({ cooldown: { blocked: true, nextAllowedAt: '2026-11-01T00:00:00Z' } })] }
    renderAdmin()
    fireEvent.click(await screen.findByRole('button', { name: /חריגת חירום/ }))
    const dialog = await screen.findByRole('dialog', { name: 'חריגת חירום' })
    const submit = within(dialog).getByRole('button', { name: /אשר חריגה/ })
    expect(submit).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/^סיבה/), { target: { value: 'תיקון אבטחה דחוף' } })
    fireEvent.click(submit)
    expect(await screen.findByText(/החריגה אושרה/)).toBeInTheDocument()
    const call = fetchSpy.mock.calls.find(([u]) => String(u) === '/api/service-plugins/admin/p1')!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ action: 'emergency', jobId: 'r1', reason: 'תיקון אבטחה דחוף' })
  })

  it('בלי הגשות בכלל: מצב ריק אחד, בלי לשוניות', async () => {
    adminBody = { control: { quotaPausedUntil: null, lock: null }, reviews: [] }
    renderAdmin()
    expect(await screen.findByText('אין הגשות של תוספי שירות')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('הלשונית לא קופצת אחרי פעולה שרוקנה אותה', async () => {
    adminBody = { control: { quotaPausedUntil: null, lock: null }, reviews: [review({}), review({ id: 'x', status: 'running' })] }
    renderAdmin()
    fireEvent.click(await screen.findByRole('button', { name: /אשר והתחל בדיקה/ }))
    adminBody = { control: { quotaPausedUntil: null, lock: null }, reviews: [review({ status: 'queued' }), review({ id: 'x', status: 'running' })] }
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'לאשר ולהתחיל בדיקה?' })).getByRole('button', { name: 'אשר והתחל בדיקה' }))
    expect(await screen.findByText('אין הגשות שממתינות לאישור')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ממתין לאישור' })).toHaveAttribute('aria-selected', 'true')
  })

  it.each([[401, 'התחבר'], [403, null]])('%s בטעינה: הסיבה, ובלי "נסה שוב"', async (status, link) => {
    fetchSpy.mockImplementationOnce(async () => new Response('{}', { status }))
    renderAdmin()
    if (link) expect(await screen.findByRole('link', { name: link })).toBeInTheDocument()
    else expect(await screen.findByText('אין לך הרשאה לראות את המסך הזה')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
  })

  it('התאריך בעברית, בלי בידוד לועזי שמשבש את הסדר', async () => {
    adminBody = { control: { quotaPausedUntil: null, lock: null }, reviews: [review({})] }
    renderAdmin()
    const line = await screen.findByText(/^הוגש /)
    expect(line.querySelector('bdi')).toBeNull()
  })

  it('תכונה כבויה (404) — הודעה', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('{"error":"disabled"}', { status: 404 }))
    renderAdmin()
    expect(await screen.findByText(/תוספי השירות כבויים באתר/)).toBeInTheDocument()
  })
})
