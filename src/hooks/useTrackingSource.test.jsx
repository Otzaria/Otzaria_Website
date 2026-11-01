import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const scan = vi.hoisted(() => ({ args: [], value: { size: [600, 800], profile: null, status: 'idle' } }))
vi.mock('./useScanLines', () => ({
  useScanLines: (url, opts) => {
    scan.args.push({ url, ...opts })
    return scan.value
  }
}))

import { useTrackingSource, choosePrimary } from './useTrackingSource'

const LAYOUT = {
  layoutVersion: 1,
  image: { width: 600, height: 800 },
  toSource: [1, 0, 0, 0, 1, 0],
  lines: [
    { k: 0, bbox: [100, 50, 500, 80], text: 'בראשית ברא אלהים', words: [[400, 500, 0.99], [250, 380, 0.9], [100, 230, 0.95]] },
    { k: 1, bbox: [100, 100, 500, 130], text: 'את השמים', words: [[300, 500, 0.9], [100, 280, 0.9]] }
  ]
}
const PROFILE = { size: [600, 800], lines: [{ bbox: [100, 50, 500, 80], words: [] }, { bbox: [100, 100, 500, 130], words: [] }] }

const respond = (status, body) => vi.fn(() => Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(body) }))

beforeEach(() => {
  scan.args = []
  scan.value = { size: [600, 800], profile: null, status: 'idle' }
})
afterEach(() => vi.unstubAllGlobals())

describe('useTrackingSource', () => {
  it('layout v1 מ-ocr-data → רמת מילה, בלי ניתוח פרופיל', async () => {
    const fetchMock = respond(200, { success: true, data: { layoutStatus: 'ok', layout: LAYOUT, image: { matches: true } } })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useTrackingSource({ bookPath: 'ספר א', pageNumber: 3, imageUrl: '/p.jpg' }))
    await waitFor(() => expect(result.current.level).toBe('word'))
    expect(result.current.source.source).toBe('layout')
    expect(result.current.hasOfficialWordLayout).toBe(true)
    expect(result.current.lines).toHaveLength(2)
    expect(result.current.status).toBe('ready')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/page-content/ocr-data?bookPath=%D7%A1%D7%A4%D7%A8%20%D7%90&pageNumber=3')
    expect(scan.args.every((a) => a.analyze === false)).toBe(true)
  })

  it('אין layout (404) / התמונה הוחלפה → מנתחים פרופיל ונופלים אליו', async () => {
    vi.stubGlobal('fetch', respond(404, { error: 'אין נתוני OCR' }))
    const { result, rerender } = renderHook(() => useTrackingSource({ bookPath: 'b', pageNumber: 1, imageUrl: '/p.jpg' }))
    await waitFor(() => expect(scan.args.at(-1).analyze).toBe(true))
    expect(result.current.level).toBe('off')
    scan.value = { size: [600, 800], profile: PROFILE, status: 'ready' }
    rerender()
    expect(result.current.source.source).toBe('profile')
    expect(result.current.level).toBe('line')
    expect(result.current.hasOfficialWordLayout).toBe(false)

    vi.stubGlobal('fetch', respond(200, { success: true, data: { layoutStatus: 'ok', layout: LAYOUT, image: { matches: false } } }))
    const replaced = renderHook(() => useTrackingSource({ bookPath: 'b', pageNumber: 2, imageUrl: '/p.jpg' }))
    await waitFor(() => expect(replaced.result.current.status).toBe('ready'))
    expect(replaced.result.current.source.source).toBe('profile')
  })

  it('extraSource במבנה האחיד עם מילים עוקף layout ברמת שורה', async () => {
    const lineOnly = { ...LAYOUT, lines: LAYOUT.lines.map(({ words, ...l }) => l) }
    vi.stubGlobal('fetch', respond(200, { success: true, data: { layoutStatus: 'ok', layout: lineOnly, image: { matches: true } } }))
    const extra = { level: 'word', source: 'local', size: [600, 800], lines: [{ id: 't0', stream: 'main', bbox: [100, 50, 500, 80], words: [{ text: 'בראשית', bbox: [400, 50, 500, 80] }] }] }
    const { result } = renderHook(() => useTrackingSource({ bookPath: 'b', pageNumber: 1, imageUrl: '/p.jpg', extraSource: extra }))
    await waitFor(() => expect(result.current.source.source).toBe('local'))
  })

  it('כבוי / בלי מזהה עמוד — בלי בקשה', () => {
    const fetchMock = respond(200, {})
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useTrackingSource({ bookPath: 'b', pageNumber: 1, enabled: false }))
    expect(result.current.level).toBe('off')
    renderHook(() => useTrackingSource({ bookPath: null, pageNumber: 1 }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('choosePrimary: מילים קודם, אחר כך שורות, ורק אז הגיבוי', () => {
    const line = { level: 'line', source: 'layout', lines: [{}] }
    const word = { level: 'word', source: 'local', lines: [{}] }
    const off = { level: 'off', source: null, lines: [] }
    const prof = { level: 'word', source: 'profile', lines: [{}] }
    expect(choosePrimary([line, off, word], prof)).toBe(word)
    expect(choosePrimary([line, off], prof)).toBe(line)
    expect(choosePrimary([off, null], prof)).toBe(prof)
    expect(choosePrimary([off], off).level).toBe('off')
  })
})
