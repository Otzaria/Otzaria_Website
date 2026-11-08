import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'
import ReportsSection from './ReportsSection'

// "דיווחים": מסננים (בוררים מעוצבים: מצב, קטגוריה, מסכת), חיתוכי האזורים מהסריקה ומהעמוד שלנו, קישור לעמוד, ושינוי
// מצב עם הערה — אותו גוף כמו קודם (PATCH reports/[id] {status, note}).

const API = '/api/admin/tzurat-hadaf'

const report = (id, extra = {}) => ({
  id,
  page: 'p1',
  slug: 'berakhot',
  masechet: 'ברכות',
  daf: 'ב:',
  category: 'linebreak',
  text: 'השורה נשברת מוקדם מדי',
  status: 'new',
  userName: 'יהודה',
  createdAt: '2026-10-22T09:00:00Z',
  scanUrl: '/api/tzurat-hadaf/pages/p1/image?side=scan',
  oursUrl: '/api/tzurat-hadaf/pages/p1/image?side=ours',
  regions: [
    { side: 'scan', x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
    { side: 'ours', x: 0.15, y: 0.25, w: 0.3, h: 0.05 },
  ],
  ...extra,
})

function mockServer(reports = [report('r1')], { fail = false } = {}) {
  const patches = []
  const gets = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET'
      const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
      if (url === `${API}/batches`) return reply(200, { batches: [{ slug: 'berakhot', masechet: 'ברכות', order: 1 }] })
      if (url.startsWith(`${API}/reports?`) || url === `${API}/reports`) {
        gets.push(url)
        return reply(200, { reports, total: reports.length })
      }
      const m = url.match(/\/reports\/(\w+)$/)
      if (m && method === 'PATCH') {
        const body = JSON.parse(init.body)
        patches.push({ id: m[1], body })
        if (fail) return reply(400, { error: 'מצב לא מוכר' })
        return reply(200, { report: { ...reports.find((r) => r.id === m[1]), status: body.status, resolution: { note: body.note } } })
      }
      throw new Error(`fetch לא צפוי: ${method} ${url}`)
    })
  )
  return { patches, gets }
}

afterEach(() => vi.unstubAllGlobals())

const renderIt = (props = {}) => render(<ToastProvider><ReportsSection {...props} /></ToastProvider>)
const pick = async (scope, label, option) => {
  await userEvent.click(within(scope).getByRole('button', { name: new RegExp(`^${label}`) }))
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`) }))
}

describe('ReportsSection', () => {
  it('מציג דיווח עם חיתוכי האזורים, המדווח וקישור לעמוד', async () => {
    const { gets } = mockServer()
    renderIt()
    const card = await screen.findByTestId('admin-report')
    expect(gets[0]).toBe(`${API}/reports?status=new&page=1`)
    expect(card.textContent).toContain('השורה נשברת מוקדם מדי')
    expect(card.textContent).toContain('שבירת שורה')
    expect(card.textContent).toContain('יהודה')
    expect(within(card).getAllByText('חדש').length).toBeGreaterThan(0)
    const imgs = within(card).getAllByRole('img').map((i) => i.getAttribute('src'))
    expect(imgs).toEqual([
      '/api/tzurat-hadaf/pages/p1/image?side=scan&x=0.1&y=0.2&w=0.3&h=0.05',
      '/api/tzurat-hadaf/pages/p1/image?side=ours&x=0.15&y=0.25&w=0.3&h=0.05',
    ])
    expect(within(card).getByRole('link', { name: /פתח את העמוד/ }).getAttribute('href')).toBe('/library/tzurat-hadaf/review?page=p1')
  })

  it('שינוי מצב עם הערה — אותו PATCH, התג מתעדכן, הכרטיס נשאר, והמונים מתעדכנים', async () => {
    const { patches } = mockServer()
    const onChanged = vi.fn()
    renderIt({ onChanged })
    const card = await screen.findByTestId('admin-report')
    const save = within(card).getByRole('button', { name: /^שמור/ })
    // "כבוי" בלי disabled (softDisabled) — אחרי השמירה הפוקוס נשאר על הכפתור
    expect(save).toHaveAttribute('aria-disabled', 'true')
    // שם ייחודי לבורר המצב שבכרטיס (לא "מצב" כמו בסרגל)
    expect(within(card).getByRole('button', { name: /^מצב הדיווח בברכות ב: של יהודה/ })).toBeInTheDocument()
    await pick(card, 'מצב', 'תוקן')
    fireEvent.change(within(card).getByLabelText(/הערה/), { target: { value: 'תוקן בבנייה 33' } })
    fireEvent.click(save)
    await waitFor(() => expect(patches).toEqual([{ id: 'r1', body: { status: 'fixed', note: 'תוקן בבנייה 33' } }]))
    await waitFor(() => expect(within(card).getAllByText('תוקן').length).toBeGreaterThan(1))
    expect(screen.getByTestId('admin-report')).toBe(card)
    expect(within(card).getByRole('button', { name: /^שמור/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(card).getByRole('button', { name: /^שמור/ })).not.toBeDisabled()
    // המונה מתעדכן מקומית, והסה"כ יורד (הדיווח יצא מ"חדש")
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledWith('report', 'new', 'fixed')
    expect(screen.getByText('0 דיווחים')).toBeInTheDocument()
    expect(await screen.findByText(/הדיווח בברכות ב: נשמר: תוקן/)).toBeInTheDocument()
  })

  it('שגיאה בשמירה — מוצגת', async () => {
    mockServer([report('r1')], { fail: true })
    renderIt()
    const card = await screen.findByTestId('admin-report')
    await pick(card, 'מצב', 'לא יתוקן')
    fireEvent.click(within(card).getByRole('button', { name: /^שמור/ }))
    expect((await within(card).findByRole('alert')).textContent).toBe('מצב לא מוכר')
  })

  it('מסננים — מצב, קטגוריה ומסכת', async () => {
    const { gets } = mockServer()
    renderIt()
    await screen.findByTestId('admin-report')
    const bar = screen.getByTestId('reports')
    await userEvent.click(within(bar).getAllByRole('button', { name: /^מצב/ })[0])
    await userEvent.click(await screen.findByRole('option', { name: /כל המצבים/ }))
    await pick(bar, 'קטגוריה', 'גודל אות')
    await pick(bar, 'מסכת', 'ברכות')
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/reports?category=size&slug=berakhot&page=1`))
  })

  it('בלי scanUrl — חיתוך דרך תמונת העמוד', async () => {
    mockServer([report('r2', { scanUrl: undefined, oursUrl: undefined, regions: [{ side: 'scan', x: 0, y: 0, w: 0.5, h: 0.5 }] })])
    renderIt()
    const card = await screen.findByTestId('admin-report')
    expect(within(card).getByRole('img').getAttribute('src')).toBe('/api/tzurat-hadaf/pages/p1/image?side=scan&x=0&y=0&w=0.5&h=0.5')
  })
})
