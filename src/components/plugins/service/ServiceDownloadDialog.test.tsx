import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ServiceDownloadDialog from './ServiceDownloadDialog'
import type { DirectInstallState } from '@/components/plugins/useDirectInstall'
import type { PublicServiceInfo } from './serviceDownloadLogic'

const idle: DirectInstallState = { phase: 'idle', pluginId: null, error: null, updated: false }

function platform(os: string, arch: string, port: number, minOs = 'Windows 10') {
  return { os, arch, minOs, port, name: `setup-${os}-${arch}.exe`, size: 2048, sha256: 'a'.repeat(64), downloadUrl: `/api/service-plugins/p1/download/r2/native-${os}-${arch}` }
}

const INFO: PublicServiceInfo = {
  pluginId: 'p1',
  pluginUid: 'org.example.svc',
  name: 'שירות לדוגמה',
  slug: 'svc',
  detection: { path: '/.well-known/otzaria-service', protocolVersion: 1, serviceId: 'org.example.svc' },
  current: {
    reviewId: 'r2',
    serviceVersion: '1.2.0',
    serviceRange: { min: '1.0.0', max: '1.9.99' },
    pluginVersion: '2.0.0',
    uninstall: 'הסרה דרך אפליקציות מותקנות',
    pluginDownloadUrl: '/api/service-plugins/p1/download/r2/plugin',
    platforms: [platform('windows', 'x64', 18090), platform('windows', 'arm64', 18090), platform('linux', 'x64', 18091, 'Ubuntu 22.04')]
  },
  previous: {
    reviewId: 'r1',
    serviceVersion: '1.1.0',
    serviceRange: { min: '1.0.0', max: null },
    pluginVersion: '1.0.0',
    uninstall: '',
    platforms: [{ ...platform('windows', 'x64', 18090), name: 'old-setup.exe', downloadUrl: '/api/service-plugins/p1/download/r1/native0' }]
  }
}

let localAnswer: (url: string) => Promise<Response>
const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = String(input)
  if (url.startsWith('http://127.0.0.1')) return localAnswer(url)
  if (url === '/api/service-plugins/p1') return new Response(JSON.stringify(INFO), { status: 200 })
  return new Response('{}', { status: 404 })
})

function setVisitor(userAgent: string, platformName = '') {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platformName)
}

const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

function renderDialog(props: Partial<Parameters<typeof ServiceDownloadDialog>[0]> = {}) {
  return render(
    <ServiceDownloadDialog
      plugin={{ id: 'p1', name: 'שירות לדוגמה', downloadUrl: '/api/plugins/p1/download', supportsDirectInstall: true }}
      installState={idle}
      onInstall={vi.fn()}
      canInstall
      onClose={vi.fn()}
      {...props}
    />
  )
}

const localJson = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  setVisitor(WINDOWS_UA, 'Win32')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ServiceDownloadDialog', () => {
  it('האזהרה הקבועה, ובדיקה מקומית רק בפורט של המערכת המוצגת', async () => {
    localAnswer = localJson({ protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '1.2.0' })
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'אפשרויות הורדה' })).toHaveTextContent('התוכנה החיצונית פועלת ברקע גם כשאוצריא סגורה.')
    await screen.findByText(/השירות מותקן במחשב הזה/)
    const localCalls = fetchSpy.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('http://127.0.0.1'))
    expect(localCalls).toEqual(['http://127.0.0.1:18090/.well-known/otzaria-service'])
    const init = fetchSpy.mock.calls.find(([u]) => String(u).startsWith('http://127.0.0.1'))?.[1] as RequestInit
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('שירות תואם — רק התוסף (הורדה או התקנה באוצריא), בלי מתקינים', async () => {
    localAnswer = localJson({ protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '1.5.0' })
    const onInstall = vi.fn()
    renderDialog({ onInstall })
    await screen.findByText(/השירות מותקן במחשב הזה/)
    expect(screen.queryByRole('heading', { name: /התקנת השירות/ })).toBeNull()
    expect(screen.getByRole('link', { name: /הורדת התוסף/ })).toHaveAttribute('href', '/api/service-plugins/p1/download/r2/plugin')
    await userEvent.click(screen.getByRole('button', { name: /התקנה באוצריא/ }))
    expect(onInstall).toHaveBeenCalledWith('/api/service-plugins/p1/download/r2/plugin')
  })

  it('שירות לא תואם — "נדרש עדכון של השירות" והמתקין', async () => {
    localAnswer = localJson({ protocolVersion: 1, serviceId: 'org.example.svc', serviceVersion: '0.9.0' })
    renderDialog()
    await screen.findByText('נדרש עדכון של השירות')
    expect(screen.getByRole('heading', { name: /התקנת השירות/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'התוסף בלבד' })).toBeNull()
  })

  it('אין תשובה — "לא הצלחנו לזהות" (לא "לא מותקן"), ושתי האפשרויות', async () => {
    localAnswer = async () => { throw new TypeError('Failed to fetch') }
    renderDialog()
    await screen.findByText('לא הצלחנו לזהות אם השירות מותקן במחשב הזה')
    expect(screen.queryByText(/לא מותקן/)).toBeNull()
    expect(screen.getByRole('heading', { name: /התקנת השירות/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'התוסף בלבד' })).toBeInTheDocument()
  })

  it('תשובה של שירות אחר בפורט — לא ידוע', async () => {
    localAnswer = localJson({ protocolVersion: 1, serviceId: 'org.other', serviceVersion: '1.2.0' })
    renderDialog()
    await screen.findByText('לא הצלחנו לזהות אם השירות מותקן במחשב הזה')
  })

  it('Windows נבחרת מראש; כמה מעבדים — בחירה ידנית מרשימה; מערכת לא נתמכת מעומעמת', async () => {
    localAnswer = async () => new Response('', { status: 404 })
    renderDialog()
    const group = await screen.findByRole('group', { name: 'מערכת הפעלה' })
    expect(within(group).getByRole('button', { name: /Windows/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: /macOS/ })).toBeDisabled()
    expect(screen.getByText(/בחרו לפי סוג המעבד/)).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /הורדת המתקין/ }).filter((l) => !l.closest('details'))
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/api/service-plugins/p1/download/r2/native-windows-x64',
      '/api/service-plugins/p1/download/r2/native-windows-arm64'
    ])
    expect(screen.getAllByText(/Windows 10/).length).toBeGreaterThan(0)
  })

  it('מערכת המבקר אינה נתמכת — הודעה מעומעמת ואין בחירה מראש', async () => {
    setVisitor('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l')
    localAnswer = async () => { throw new TypeError('x') }
    renderDialog()
    await screen.findByText(/המערכת שלך \(Android\) אינה נתמכת/)
    expect(screen.getByText('בחרו מערכת הפעלה כדי לראות את המתקינים.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Linux/ }))
    expect(screen.getByText(/בחרתם מערכת אחרת/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /הורדת המתקין/ }).filter((l) => !l.closest('details'))[0]).toHaveAttribute('href', '/api/service-plugins/p1/download/r2/native-linux-x64')
    expect(screen.getByText('Ubuntu 22.04')).toBeInTheDocument()
  })

  it('המתקין הקודם — רק בתוך "גרסה קודמת"', async () => {
    localAnswer = async () => { throw new TypeError('x') }
    renderDialog()
    const summary = await screen.findByText(/גרסה קודמת/)
    const details = summary.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(within(details).getByRole('link', { name: /הורדת המתקין/, hidden: true })).toHaveAttribute('href', '/api/service-plugins/p1/download/r1/native0')
  })

  it('כשל בטעינת הנתונים — הודעה, בלי בדיקה מקומית', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('{}', { status: 500 }))
    renderDialog()
    await screen.findByRole('alert')
    expect(screen.queryByRole('link', { name: /הורדת התוסף/ })).toBeNull()
    await waitFor(() => expect(fetchSpy.mock.calls.some(([u]) => String(u).startsWith('http://127.0.0.1'))).toBe(false))
  })

  it('404 (תוספי השירות כבויים) — קובץ התוסף בלבד מ-downloadUrl, התקנה ישירה והאזהרה הקבועה', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'disabled' }), { status: 404 }))
    const onInstall = vi.fn()
    renderDialog({ onInstall })
    expect(await screen.findByText(/אפשרויות ההתקנה של השירות אינן זמינות זמנית/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'אפשרויות הורדה' })).toHaveTextContent('התוכנה החיצונית פועלת ברקע גם כשאוצריא סגורה.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('heading', { name: /התקנת השירות/ })).toBeNull()
    expect(screen.getByRole('link', { name: /הורדת התוסף/ })).toHaveAttribute('href', '/api/plugins/p1/download')
    await userEvent.click(screen.getByRole('button', { name: /התקנה באוצריא/ }))
    expect(onInstall).toHaveBeenCalledWith('/api/plugins/p1/download')
    expect(fetchSpy.mock.calls.some(([u]) => String(u).startsWith('http://127.0.0.1'))).toBe(false)
  })

  it('404 בלי תמיכה בהתקנה ישירה — רק הורדת הקובץ', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'disabled' }), { status: 404 }))
    renderDialog({ canInstall: false })
    expect(await screen.findByRole('link', { name: /הורדת התוסף/ })).toHaveAttribute('href', '/api/plugins/p1/download')
    expect(screen.queryByRole('button', { name: /התקנה באוצריא/ })).toBeNull()
  })
})
