import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { pageKey, readRecord, writeRecord, saveDraft, removeRecord, listRecords, localSession, rememberOwner } from './store'
import { syncRecord, syncAll } from './sync'

const key = pageKey('u', 'ספר', 10)
const initial = () => ({ version: 1, key, user: { id: 'u', name: 'משתמש' }, bookPath: 'ספר', pageNumber: 10,
  book: { name: 'ספר' }, baseVersion: 'base', data: { content: 'ישן', saveRevision: 5 }, draft: null })
const snapshot = content => ({ bookPath: 'ספר', pageNumber: 10, content, leftColumn: '', rightColumn: '', twoColumns: false, rightColumnName: 'ימין', leftColumnName: 'שמאל' })
const ok = version => ({ ok: true, json: async () => ({ success: true, contentVersion: version }) })
let fetchMock
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_key, options, callback) => callback ? callback({ name: _key }) : options()) } })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  fetchMock = vi.fn().mockResolvedValue(ok('next'))
  vi.stubGlobal('fetch', fetchMock)
  writeRecord(initial())
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); delete navigator.locks; delete navigator.onLine })

test('journals every edit before a network request and isolates account/page keys', () => {
  saveDraft(key, snapshot('חדש'))
  expect(readRecord(key).draft.content).toBe('חדש')
  expect(fetchMock).not.toHaveBeenCalled()
  expect(readRecord(pageKey('other', 'ספר', 10))).toBeNull()
  expect(listRecords('other')).toEqual([])
  rememberOwner('u')
  expect(localSession('ספר', 10)).toMatchObject({ offline: true, user: { id: 'u', role: 'user' } })
})
test('does not delete pending edits and surfaces quota failure without removing the previous copy', async () => {
  saveDraft(key, snapshot('שמור'))
  await expect(removeRecord(key)).rejects.toThrow()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  expect(() => saveDraft(key, snapshot('לא נשמר'))).toThrow()
  expect(readRecord(key).draft.content).toBe('שמור')
})
test('syncs with account and base version; acknowledges only the exact draft', async () => {
  saveDraft(key, snapshot('חדש'))
  expect(await syncRecord(key)).toBe(true)
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ expectedUserId: 'u', baseVersion: 'base', content: 'חדש' })
  expect(readRecord(key)).toMatchObject({ baseVersion: 'next', draft: null, data: { content: 'חדש' } })
})
test('retries a lost response with the same ID, even after a newer edit and reload', async () => {
  saveDraft(key, snapshot('ראשון'))
  const firstId = readRecord(key).draft.offlineSaveId
  fetchMock.mockRejectedValueOnce(new TypeError('offline'))
  expect(await syncRecord(key)).toBe(false)
  saveDraft(key, snapshot('אחרון'))
  fetchMock.mockResolvedValueOnce(ok('v1')).mockResolvedValueOnce(ok('v2'))
  expect(await syncRecord(key)).toBe(true)
  const bodies = fetchMock.mock.calls.map(call => JSON.parse(call[1].body))
  expect(bodies[1]).toEqual(bodies[0])
  expect(bodies[1].offlineSaveId).toBe(firstId)
  expect(bodies[2]).toMatchObject({ content: 'אחרון', baseVersion: 'v1' })
  expect(readRecord(key)).toMatchObject({ data: { content: 'אחרון' }, draft: null, inFlight: null, baseVersion: 'v2' })
})
test('an edit during an in-flight save is retained and then uploaded with the acknowledged version', async () => {
  saveDraft(key, snapshot('ראשון'))
  fetchMock.mockImplementationOnce(async () => {
    saveDraft(key, snapshot('שני'))
    return ok('v1')
  }).mockResolvedValueOnce(ok('v2'))
  expect(await syncRecord(key)).toBe(true)
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ content: 'שני', baseVersion: 'v1' })
})
test.each([401, 403, 409, 500])('HTTP %s never acknowledges or deletes a draft', async status => {
  saveDraft(key, snapshot('מקומי'))
  fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: 'עצור', ...(status === 409 ? { code: 'OFFLINE_CONFLICT' } : {}) }) })
  expect(await syncRecord(key)).toBe(false)
  expect(readRecord(key)).toMatchObject({ draft: { content: 'מקומי' }, baseVersion: 'base', problem: { message: 'עצור' } })
  if (status === 409) {
    saveDraft(key, snapshot('עוד עריכה'))
    await syncRecord(key)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }
})
test('syncAll only uploads the active account and skips requests while offline', async () => {
  saveDraft(key, snapshot('מקומי'))
  await syncAll('other')
  expect(fetchMock).not.toHaveBeenCalled()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  await syncAll('u')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('damaged records remain available for recovery without blocking healthy drafts', () => {
  const damagedKey = pageKey('u', 'damaged', 1)
  localStorage.setItem(damagedKey, '{broken')
  expect(() => readRecord(damagedKey)).toThrow()
  expect(listRecords('u').map(r => r.key)).toEqual([key])
  expect(localStorage.getItem(damagedKey)).toBe('{broken')
})

test('opening any editor synchronizes pending drafts from all prepared pages of that account', async () => {
  const second = pageKey('u', 'second', 2)
  writeRecord({ ...initial(), key: second, bookPath: 'second', pageNumber: 2 })
  saveDraft(key, snapshot('עמוד א'))
  saveDraft(second, { ...snapshot('עמוד ב'), bookPath: 'second', pageNumber: 2 })
  await syncAll('u')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(listRecords('u').every(record => record.draft === null)).toBe(true)
})

test('a different editor cannot remove a copy while its edit lock is held', async () => {
  navigator.locks.request.mockImplementationOnce(async (_key, _options, callback) => callback(null))
  await expect(removeRecord(key)).rejects.toThrow('פתוח בלשונית אחרת')
  expect(readRecord(key)).not.toBeNull()
})
