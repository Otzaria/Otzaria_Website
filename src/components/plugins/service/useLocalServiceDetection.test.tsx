import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLocalServiceDetection } from './useLocalServiceDetection'

const range = { min: '1.0.0', max: null }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useLocalServiceDetection', () => {
  it('כבוי — idle ובלי בקשות', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useLocalServiceDetection({ enabled: false, ports: [18090], serviceId: 'org.x', range }))
    expect(result.current.status).toBe('idle')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('בלי פורטים — לא ידוע, בלי בקשות', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useLocalServiceDetection({ enabled: true, ports: [], serviceId: 'org.x', range }))
    expect(result.current.status).toBe('unknown')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('פסק זמן — הבקשה מבוטלת והתוצאה "לא ידוע"', async () => {
    const fetchSpy = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useLocalServiceDetection({ enabled: true, ports: [18090], serviceId: 'org.x', range, timeoutMs: 20 }))
    expect(result.current.status).toBe('checking')
    await waitFor(() => expect(result.current).toEqual({ status: 'unknown', version: null }))
  })

  it('תשובה גדולה מ-4KiB — לא ידוע', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ protocolVersion: 1, serviceId: 'org.x', serviceVersion: '1.0.0', pad: 'x'.repeat(5000) }))))
    const { result } = renderHook(() => useLocalServiceDetection({ enabled: true, ports: [18090], serviceId: 'org.x', range }))
    await waitFor(() => expect(result.current.status).toBe('unknown'))
  })

  it('תואם בפורט אחד מתוך כמה — תואם', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes(':18091')
      ? new Response(JSON.stringify({ protocolVersion: 1, serviceId: 'org.x', serviceVersion: '2.0.0' }))
      : new Response('', { status: 404 })))
    const { result } = renderHook(() => useLocalServiceDetection({ enabled: true, ports: [18090, 18091], serviceId: 'org.x', range }))
    await waitFor(() => expect(result.current).toEqual({ status: 'compatible', version: '2.0.0' }))
  })
})
