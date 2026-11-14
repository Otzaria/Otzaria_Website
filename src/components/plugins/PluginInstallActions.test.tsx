import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PluginInstallActions, { canDirectInstall } from './PluginInstallActions'
import { useDirectInstall } from './useDirectInstall'
import { buildDirectPluginInstallUrl } from '@/lib/pluginInstall'
import type { DirectInstallState } from './useDirectInstall'

vi.mock('@/lib/pluginInstall', () => ({ buildDirectPluginInstallUrl: vi.fn(() => window.location.href) }))

const idle: DirectInstallState = { phase: 'idle', pluginId: null, error: null, updated: false }

describe('PluginInstallActions', () => {
  it('קישור ההורדה — אותה כתובת, בלשונית חדשה', () => {
    render(<PluginInstallActions plugin={{ id: 'p1', downloadUrl: '/api/plugins/p1/download' }} installState={idle} onInstall={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'הורדה' })
    expect(link).toHaveAttribute('href', '/api/plugins/p1/download')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('בלי תמיכה בהתקנה ישירה — רק הורדה', () => {
    render(<PluginInstallActions plugin={{ id: 'p1', downloadUrl: '/d', supportsDirectInstall: false }} installState={idle} onInstall={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('עם תמיכה — כפתור התקנה שמפעיל onInstall, ותווית מותאמת', async () => {
    const onInstall = vi.fn()
    render(
      <PluginInstallActions
        plugin={{ id: 'p1', downloadUrl: '/d', supportsDirectInstall: true }}
        installState={idle}
        onInstall={onInstall}
        emphasis="page"
        installLabel="התקנה ישירה לאוצריא"
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /התקנה ישירה לאוצריא/ }))
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('canDirectInstall דורש גם תמיכה וגם קישור', () => {
    expect(canDirectInstall({ id: 'a', downloadUrl: '/d', supportsDirectInstall: true })).toBe(true)
    expect(canDirectInstall({ id: 'a', downloadUrl: '', supportsDirectInstall: true })).toBe(false)
    expect(canDirectInstall({ id: 'a', downloadUrl: '/d' })).toBe(false)
  })
})

describe('PluginInstallActions — תוסף שירות', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('"אפשרויות הורדה" במקום הורדה/התקנה, ושום בקשה לפני הלחיצה', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetchSpy)
    render(
      <PluginInstallActions
        plugin={{ id: 'p1', name: 'שירות', downloadUrl: '/api/plugins/p1/download', supportsDirectInstall: true, hasService: true }}
        installState={idle}
        onInstall={vi.fn()}
      />
    )
    expect(screen.queryByRole('link', { name: 'הורדה' })).toBeNull()
    expect(screen.queryByRole('button', { name: /התקנה ישירה/ })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'אפשרויות הורדה' }))
    expect(await screen.findByRole('dialog', { name: 'אפשרויות הורדה' })).toBeInTheDocument()
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/service-plugins/p1'))
  })

  it('תוספי השירות כבויים (404 disabled) — עדיין אפשר להוריד את קובץ התוסף', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'disabled' }), { status: 404 })))
    render(
      <PluginInstallActions
        plugin={{ id: 'p1', name: 'שירות', downloadUrl: '/api/plugins/p1/download', hasService: true }}
        installState={idle}
        onInstall={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'אפשרויות הורדה' }))
    expect(await screen.findByRole('link', { name: /הורדת התוסף/ })).toHaveAttribute('href', '/api/plugins/p1/download')
    expect(screen.queryByRole('button', { name: /התקנה באוצריא/ })).toBeNull()
  })
})


it('מעביר ל-hook ההתקנה את כתובת הגרסה מהחלון, גם אם כתובת הקטלוג מפנה לגרסה מתחלפת', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url) === '/api/service-plugins/p1') return new Response(JSON.stringify({
      pluginId: 'p1', pluginUid: 'org.example.svc', current: {
        reviewId: 'r1', serviceVersion: '1.0.0', pluginVersion: '1.0.0', serviceRange: { min: '1.0.0', max: null },
        pluginDownloadUrl: '/api/service-plugins/p1/download/r1/plugin', platforms: [],
      },
    }))
    return new Response('{}', { status: 404 })
  }))
  const plugin = { id: 'p1', downloadUrl: '/api/plugins/p1/download', hasService: true, supportsDirectInstall: true }
  function Harness() {
    const { installState, install } = useDirectInstall()
    return <PluginInstallActions plugin={plugin} installState={installState}
      onInstall={(downloadUrl) => { void install({ ...plugin, downloadUrl: downloadUrl || plugin.downloadUrl }) }} />
  }
  try {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'אפשרויות הורדה' }))
    await userEvent.click(await screen.findByRole('button', { name: /התקנה באוצריא/ }))
    await waitFor(() => expect(buildDirectPluginInstallUrl).toHaveBeenCalledWith(
      '/api/service-plugins/p1/download/r1/plugin', window.location.origin, undefined))
  } finally { vi.unstubAllGlobals() }
})
