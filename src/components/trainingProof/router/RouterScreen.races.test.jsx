import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { fakeApi, routerPublic } from '../testing/fakeApi'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => nav }))
const alert = vi.hoisted(() => vi.fn())
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: alert }) }))

import RouterScreen from './RouterScreen'

// תשובות נשלטות מאפשרות הקשות בזמן בקשה פתוחה, בלי להניח רשת מיידית.
function delayedApi(items) {
  const pending = []
  const released = new Set()
  const { calls } = fakeApi({
    'GET /api/training-proof/round?section=router': () => ({ status: 200, data: { round: 'r1', items, open: items.length } }),
    'POST /api/training-proof/items/*': (body, path) => {
      const id = path.split('/')[4]
      if (released.has(id)) return { status: 409, data: { error: 'השורה כבר לא אצלך' } }
      return new Promise((resolve) => pending.push({
        id, body,
        finish(status = 200) {
          if (status !== 200) return resolve({ status, data: { error: 'שגיאה זמנית' } })
          const base = items.find((item) => item.id === id)
          if (body.skip) released.add(id)
          resolve({ status, data: {
            item: { ...base, status: body.skip ? 'available' : 'submitted', result: body.skip ? null : body },
            skipped: !!body.skip,
          } })
        },
      }))
    },
  })
  return {
    marks: () => calls.filter((call) => call.path.endsWith('/mark')),
    finish: async (index, status) => act(async () => pending[index].finish(status)),
  }
}

const press = (key, extra = {}) => fireEvent.keyDown(window, { key, ...extra })
const card = (id) => within(document.getElementById(`tp-line-${id}`))
const noLost = () => {
  expect(alert).not.toHaveBeenCalled()
  expect(screen.queryByText(/השורות שלא סימנתם עברו למתנדב אחר/)).not.toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

describe('RouterScreen — דילוג מול כתיבה מושהית', () => {
  it('S נוסף, גם בלי repeat, אינו שולח דילוג כפול; repeat אינו מדלג גם על השורה הבאה', async () => {
    const api = delayedApi([routerPublic(0), routerPublic(1)])
    render(<RouterScreen />)
    await screen.findByText('שורה 1 מתוך 2')
    press('s', { code: 'KeyS' })
    press('s', { code: 'KeyS' })
    press('s', { code: 'KeyS', repeat: true })
    expect(api.marks()).toHaveLength(1)
    expect(card('r0').getByRole('button', { name: /דלג/ })).toBeDisabled()
    await api.finish(0)
    await waitFor(() => expect(document.getElementById('tp-line-r1')).toHaveAttribute('aria-current', 'true'))
    press('s', { code: 'KeyS', repeat: true })
    expect(api.marks()).toHaveLength(1)
    noLost()
    // הקשה חדשה ומכוונת על השורה הבאה עדיין עובדת.
    press('ד', { code: 'KeyS' })
    expect(api.marks()).toHaveLength(2)
    await api.finish(1)
    expect(screen.getAllByText('דילגתם — השורה חזרה למאגר')).toHaveLength(2)
    noLost()
  })

  it('במהלך דילוג לא נשמרים כתב, אישור ההצעה או פסילה על השורה ששוחררה', async () => {
    const api = delayedApi([routerPublic(0, { pred: null })])
    render(<RouterScreen />)
    await screen.findByText('שורה 1 מתוך 1')
    press('s', { code: 'KeyS' })
    press('1')
    press('Enter')
    press('0')
    expect(api.marks().map((call) => call.body)).toEqual([{ skip: true }])
    await api.finish(0)
    press('1')
    press('s', { code: 'KeyS' })
    expect(api.marks()).toHaveLength(1)
    expect(card('r0').getByText('דילגתם — השורה חזרה למאגר')).toBeInTheDocument()
    noLost()
  })

  it('דילוג חסום עד לסיום כל הכתיבות, ועריכת כתב מאוחרת עדיין נשמרת', async () => {
    const api = delayedApi([routerPublic(0)])
    render(<RouterScreen />)
    await screen.findByText('שורה 1 מתוך 1')
    press('1')
    press('2')
    expect(api.marks().map((call) => call.body)).toEqual([{ label: 'square' }, { label: 'rashi' }])
    press('s', { code: 'KeyS' })
    expect(api.marks()).toHaveLength(2)
    await api.finish(0)
    // useRound יכול כבר להסיר saving אחרי תשובה אחת; נעילת הדילוג עדיין חלה.
    expect(card('r0').getByRole('button', { name: /דלג/ })).toBeDisabled()
    press('s', { code: 'KeyS' })
    expect(api.marks()).toHaveLength(2)
    await api.finish(1)
    expect(card('r0').getByRole('button', { name: /דלג/ })).toBeEnabled()
    expect(card('r0').getByRole('button', { name: /^רש/ })).toHaveAttribute('aria-pressed', 'true')
    press('s', { code: 'KeyS' })
    expect(api.marks().at(-1).body).toEqual({ skip: true })
    await api.finish(2)
    noLost()
  })

  it('כתיבה בשורה אחת אינה חוסמת דילוג בשורה אחרת', async () => {
    const api = delayedApi([routerPublic(0), routerPublic(1)])
    render(<RouterScreen />)
    await screen.findByText('שורה 1 מתוך 2')
    press('1')
    press('ArrowDown')
    press('s', { code: 'KeyS' })
    expect(api.marks().map(({ path, body }) => ({ path, body }))).toEqual([
      { path: '/api/training-proof/items/r0/mark', body: { label: 'square' } },
      { path: '/api/training-proof/items/r1/mark', body: { skip: true } },
    ])
    await api.finish(1)
    await api.finish(0)
    noLost()
  })

  it('כשל דילוג משחרר את הנעילה ומאפשר ניסיון נוסף', async () => {
    const api = delayedApi([routerPublic(0)])
    render(<RouterScreen />)
    await screen.findByText('שורה 1 מתוך 1')
    press('s', { code: 'KeyS' })
    await api.finish(0, 500)
    expect(alert).toHaveBeenCalledWith('הדילוג נכשל', 'שגיאה זמנית')
    alert.mockClear()
    press('s', { code: 'KeyS' })
    expect(api.marks()).toHaveLength(2)
    await api.finish(1)
    expect(card('r0').getByText('דילגתם — השורה חזרה למאגר')).toBeInTheDocument()
    noLost()
  })
})
