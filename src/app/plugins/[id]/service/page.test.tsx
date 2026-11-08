import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { zipSync, strToU8 } from 'fflate'

const push = vi.fn()
const showAlert = vi.fn()
const showConfirm = vi.fn(async () => true)

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/plugins/p1/service', notFound: vi.fn() }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert, showConfirm }) }))

import ServiceSubmissionPageClient from './ServiceSubmissionPageClient'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

function manage(overrides: Record<string, unknown> = {}) {
  return {
    plugin: { id: 'p1', name: 'שירות לדוגמה', slug: 'svc', pluginUid: 'org.example.svc', isApproved: false, hasService: true },
    enabled: true,
    viewerIsOwner: true,
    limits: {},
    cooldown: { blocked: false, nextAllowedAt: null },
    adminException: false,
    canRollback: false,
    current: null,
    reviews: [],
    ...overrides
  }
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
let routes: Record<string, Handler>
const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const key = `${init?.method || 'GET'} ${url}`
  const handler = routes[key]
  if (!handler) return new Response(JSON.stringify({ error: `unexpected ${key}` }), { status: 500 })
  return handler(url, init)
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function pluginFile() {
  const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify({ id: 'org.example.svc', version: '1.0.0' })) })
  const file = new File([Uint8Array.from(bytes)], 'svc.otzplugin')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => Uint8Array.from(bytes).buffer })
  return file
}

const byLabel = (re: RegExp) => screen.getByLabelText(re) as HTMLInputElement

async function fillServiceForm() {
  const plugin = pluginFile()
  fireEvent.change(byLabel(/^קובץ התוסף \(/), { target: { files: [plugin] } })
  await waitFor(() => expect(byLabel(/^גרסת התוסף/).value).toBe('1.0.0'))
  fireEvent.change(byLabel(/^גרסת השירות/), { target: { value: '1.0.0' } })
  fireEvent.change(byLabel(/^גרסת שירות מינימלית/), { target: { value: '1.0.0' } })
  fireEvent.change(byLabel(/^גרסת שירות מרבית/), { target: { value: '1.9.99' } })
  fireEvent.change(byLabel(/^מאגר GitHub/), { target: { value: 'owner/repo' } })
  fireEvent.change(byLabel(/^commit מלא/), { target: { value: COMMIT } })
  const installer = new File(['installer-bytes'], 'setup.exe')
  fireEvent.change(byLabel(/^קובץ המתקין/), { target: { files: [installer] } })
  fireEvent.change(byLabel(/^מערכת הפעלה/), { target: { value: 'windows' } })
  fireEvent.change(byLabel(/^מעבד/), { target: { value: 'x64' } })
  fireEvent.change(byLabel(/^מערכת מינימלית/), { target: { value: 'Windows 10' } })
  fireEvent.change(byLabel(/^פורט הזיהוי/), { target: { value: '18090' } })
  fireEvent.change(byLabel(/^קישור לאותו קובץ/), { target: { value: 'https://github.com/owner/repo/releases/download/v1.0.0/setup.exe' } })
  fireEvent.change(byLabel(/^הוראות הסרת השירות/), { target: { value: 'הסרה דרך אפליקציות מותקנות' } })
  return { plugin, installer }
}

beforeEach(() => {
  push.mockReset(); showAlert.mockReset(); showConfirm.mockClear(); fetchSpy.mockClear()
  routes = { 'GET /api/service-plugins/p1/manage': () => json(manage()) }
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

describe('/plugins/[id]/service', () => {
  it('הנתונים רק מ-manage; כותרת, האזהרה על אישור הבנייה ו-Inno Setup / WiX Burn', async () => {
    render(<ServiceSubmissionPageClient pluginId="p1" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'הגשת שירות' })).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'הגשה חדשה' })
    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual(['/api/service-plugins/p1/manage'])
    expect(screen.getByText(/attest-build-provenance/)).toBeInTheDocument()
    expect(screen.getByText('Inno Setup')).toBeInTheDocument()
    expect(screen.getByText('WiX Burn')).toBeInTheDocument()
    // עדכון תוסף בלבד — רק אחרי שירות מאושר
    expect(screen.getByRole('radio', { name: /עדכון תוסף בלבד/ })).toBeDisabled()
  })

  it('זרימה מלאה: טיוטה → PUT לכל קובץ בזה אחר זה → הקפאה', async () => {
    const order: string[] = []
    routes['POST /api/service-plugins/p1/drafts'] = (_u, _init) => {
      order.push('drafts')
      return json({ reviewId: 'r1', uploads: { plugin: '/api/service-plugins/p1/drafts/r1/assets/plugin', native0: '/api/service-plugins/p1/drafts/r1/assets/native0' } }, 201)
    }
    routes['PUT /api/service-plugins/p1/drafts/r1/assets/plugin'] = () => { order.push('plugin'); return json({ key: 'plugin' }) }
    routes['PUT /api/service-plugins/p1/drafts/r1/assets/native0'] = () => { order.push('native0'); return json({ key: 'native0' }) }
    routes['POST /api/service-plugins/p1/drafts/r1/seal'] = () => { order.push('seal'); return json({ status: 'pending_admin', digest: 'd' }) }

    render(<ServiceSubmissionPageClient pluginId="p1" />)
    await screen.findByRole('heading', { name: 'הגשה חדשה' })
    const { plugin, installer } = await fillServiceForm()
    fireEvent.click(screen.getByRole('button', { name: 'הגשה לבדיקה' }))

    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('ההגשה נשלחה', expect.stringContaining('ממתינה כעת לבחירת מנהל')))
    expect(order).toEqual(['drafts', 'plugin', 'native0', 'seal'])

    const draftCall = fetchSpy.mock.calls.find(([u, i]) => String(u).endsWith('/drafts') && i?.method === 'POST')!
    expect(JSON.parse(String(draftCall[1]!.body))).toEqual({
      kind: 'service',
      pluginVersion: '1.0.0',
      pluginSize: plugin.size,
      serviceVersion: '1.0.0',
      serviceRange: { min: '1.0.0', max: '1.9.99' },
      sources: [{ repository: 'owner/repo', commit: COMMIT }],
      changeNotes: '',
      uninstall: 'הסרה דרך אפליקציות מותקנות',
      virusTotalConsent: false,
      assets: [{
        name: 'setup.exe', size: installer.size, os: 'windows', arch: 'x64', minOs: 'Windows 10', port: 18090,
        bundledPluginPath: 'plugin.otzplugin', releaseUrl: 'https://github.com/owner/repo/releases/download/v1.0.0/setup.exe'
      }]
    })
    const puts = fetchSpy.mock.calls.filter(([, i]) => i?.method === 'PUT')
    expect(puts.map(([, i]) => i!.body)).toEqual([plugin, installer])
  })

  it('שגיאות השרת בהקפאה מוצגות כרשימה', async () => {
    routes['POST /api/service-plugins/p1/drafts'] = () => json({ reviewId: 'r1', uploads: { plugin: '/u/plugin', native0: '/u/native0' } }, 201)
    routes['PUT /u/plugin'] = () => json({})
    routes['PUT /u/native0'] = () => json({})
    routes['POST /api/service-plugins/p1/drafts/r1/seal'] = () => json({ error: 'ההגשה נדחתה', errors: ['מזהה התוסף אינו תואם'] }, 400)
    render(<ServiceSubmissionPageClient pluginId="p1" />)
    await screen.findByRole('heading', { name: 'הגשה חדשה' })
    await fillServiceForm()
    fireEvent.click(screen.getByRole('button', { name: 'הגשה לבדיקה' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('מזהה התוסף אינו תואם')
    expect(alert).toHaveTextContent('בטלו את ההגשה והגישו מחדש')
    expect(showAlert).not.toHaveBeenCalled()
  })

  it('בדיקה מקדימה — כל השגיאות יחד ובלי פנייה לשרת', async () => {
    render(<ServiceSubmissionPageClient pluginId="p1" />)
    await screen.findByRole('heading', { name: 'הגשה חדשה' })
    fireEvent.click(screen.getByRole('button', { name: 'הגשה לבדיקה' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('יש לבחור את קובץ התוסף')
    expect(alert).toHaveTextContent('יש לכתוב הוראות הסרה של השירות')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('רשימת ההגשות: תג מצב, דוח כטקסט בלבד, וביטול הגשה ממתינה', async () => {
    routes['GET /api/service-plugins/p1/manage'] = () => json(manage({
      reviews: [
        { id: 'r2', kind: 'service', status: 'pending_admin', pluginVersion: '1.1.0', serviceVersion: '1.1.0', createdAt: '2026-10-20T10:00:00Z', selectedAt: null, decidedAt: null, decision: null, report: null, lastErrorClass: null, uploads: { plugin: true, native0: true }, assets: [] },
        { id: 'r1', kind: 'service', status: 'rejected', pluginVersion: '1.0.0', serviceVersion: '1.0.0', createdAt: '2026-10-01T10:00:00Z', selectedAt: null, decidedAt: null, decision: 0, report: '<img src=x onerror=alert(1)> נמצאה הורדת קוד', lastErrorClass: null, uploads: {}, assets: [] }
      ]
    }))
    routes['DELETE /api/service-plugins/p1/drafts/r2'] = () => json({ ok: true })
    const { container } = render(<ServiceSubmissionPageClient pluginId="p1" />)
    const list = await screen.findByRole('heading', { name: 'ההגשות שלך' })
    const section = list.closest('section') as HTMLElement
    expect(within(section).getByText('ממתין לבחירת מנהל')).toBeInTheDocument()
    expect(within(section).getByText('נדחה')).toBeInTheDocument()
    expect(within(section).getByText(/<img src=x onerror=alert\(1\)> נמצאה הורדת קוד/)).toBeInTheDocument()
    expect(container.querySelector('img[src="x"]')).toBeNull()
    // הגשה פעילה — אין טופס חדש
    expect(screen.queryByRole('heading', { name: 'הגשה חדשה' })).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: /ביטול ההגשה/ }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/service-plugins/p1/drafts/r2', { method: 'DELETE' }))
    expect(showConfirm).toHaveBeenCalled()
  })

  it('מנהל שאינו הבעלים — צפייה בלבד: בלי טופס, ביטול וחזרה לאחור', async () => {
    const pending = { id: 'r2', kind: 'service', status: 'pending_admin', pluginVersion: '1.1.0', serviceVersion: '1.1.0', createdAt: '2026-10-20T10:00:00Z', selectedAt: null, decidedAt: null, decision: null, report: null, lastErrorClass: null, uploads: {}, assets: [] }
    const done = { ...pending, id: 'r1', status: 'approved', pluginVersion: '1.0.0' }
    routes['GET /api/service-plugins/p1/manage'] = () => json(manage({
      viewerIsOwner: false,
      canRollback: true,
      current: { serviceVersion: '1.0.0', pluginVersion: '1.0.0', serviceRange: null, platforms: [] },
      reviews: [pending, done]
    }))
    render(<ServiceSubmissionPageClient pluginId="p1" />)
    expect(await screen.findByText(/צפייה בלבד/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /תוספי שירות/ })).toHaveAttribute('href', '/library/admin/plugins?view=service')
    expect(screen.getByRole('heading', { name: 'ההגשות' })).toBeInTheDocument()
    expect(screen.getByText('ממתין לבחירת מנהל')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ביטול ההגשה/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /חזרה לגרסת השירות הקודמת/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'הגשה חדשה' })).toBeNull()
    expect(screen.queryByText(/יש הגשה פעילה/)).toBeNull()
  })

  it('בלי viewerIsOwner בתשובה — מתייחסים כצפייה בלבד', async () => {
    routes['GET /api/service-plugins/p1/manage'] = () => {
      const { viewerIsOwner: _omit, ...rest } = manage()
      return json(rest)
    }
    render(<ServiceSubmissionPageClient pluginId="p1" />)
    expect(await screen.findByText(/צפייה בלבד/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'הגשה חדשה' })).toBeNull()
  })

  it('בעלים — כפתור החזרה לאחור מוצג ושולח בקשה', async () => {
    routes['GET /api/service-plugins/p1/manage'] = () => json(manage({
      canRollback: true,
      current: { serviceVersion: '1.1.0', pluginVersion: '1.1.0', serviceRange: null, platforms: [] }
    }))
    routes['POST /api/service-plugins/p1/rollback'] = () => json({ ok: true })
    render(<ServiceSubmissionPageClient pluginId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: /חזרה לגרסת השירות הקודמת/ }))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('בוצע', expect.any(String)))
    expect(screen.queryByText(/צפייה בלבד/)).toBeNull()
  })

  it('403 — הודעה ברורה', async () => {
    routes['GET /api/service-plugins/p1/manage'] = () => json({ error: 'forbidden' }, 403)
    render(<ServiceSubmissionPageClient pluginId="p1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('אין לך הרשאה')
  })
})
