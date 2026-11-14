// "ממתין לטיפולך": רשימה אחת לפי דחיפות, כרטיס-קישור עם שם נגיש כמשפט, "לא הצלחנו לטעון" עם
// "נסה שוב" למקום שנכשל, "כבר מטופל" עם משפטי שלילה, "הכול מטופל" פעם אחת, והודעה אחת כשהכול נכשל.
// משוב המשתמש: המילה "תור" לא מופיעה בשום טקסט גלוי או נגיש — נבדק בכל מצב.
import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))

import { buildDashboardView, visibleQueues } from '@/lib/adminDashboard'
import DashboardQueuesView from './DashboardQueuesView'

const NOW = Date.UTC(2026, 10, 1, 12)
const DAY = 24 * 60 * 60 * 1000

function renderView(role, results, features) {
  const utils = render(<DashboardQueuesView view={buildDashboardView(role, results, NOW, features)} />)
  // אף מצב לא מציג למשתמש את המילה "תור" (גם לא בשמות נגישים)
  expect(utils.container.textContent).not.toMatch(/תור/)
  for (const el of utils.container.querySelectorAll('[aria-label]')) expect(el.getAttribute('aria-label')).not.toMatch(/תור/)
  return utils
}

const ocr = (over = {}) => ({
  'ocr-lines': { status: 'ok', count: 0 },
  'ocr-layout': { status: 'ok', count: 0 },
  'proof-review': { status: 'ok', count: 0 },
  'proof-volunteers': { status: 'ok', count: 0 },
  ...over,
})

describe('DashboardQueuesView', () => {
  test('מקום עם פריטים — כרטיס-קישור, ושמו הנגיש הוא משפט אחד', () => {
    renderView('admin_ocr', ocr({ 'ocr-lines': { status: 'ok', count: 3949, oldest: new Date(NOW - 3 * DAY) } }))
    expect(screen.getByRole('heading', { level: 2, name: 'ממתין לטיפולך' })).toBeInTheDocument()
    expect(screen.getByText('יש מה לטפל במקום אחד')).toBeInTheDocument()
    const card = screen.getByRole('link', { name: 'תמלול שורות: 3,949 שורות ממתינות לאישור. הוותיקה מלפני 3 ימים' })
    expect(card).toHaveAttribute('href', '/library/admin/ocr-lines')
    expect(card).toHaveTextContent('3,949')
  })

  test('רשימה אחת לפי דחיפות, בלי כותרות קבוצה', () => {
    const results = Object.fromEntries(visibleQueues('admin').map((q) => [q.id, { status: 'ok', count: 2 }]))
    const { container } = renderView('admin', results)
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    const order = [...container.querySelectorAll('[data-queue]')].map((el) => el.dataset.queue)
    expect(order.slice(0, 2)).toEqual(['conflicts', 'corrections-failed'])
    expect(order.at(-1)).toBe('dictionary')
  })

  test('ותק חריג — תג; תקלה — המספר בצבע error', () => {
    const results = Object.fromEntries(visibleQueues('admin').map((q) => [q.id, { status: 'ok', count: 0 }]))
    results['ocr-lines'] = { status: 'ok', count: 5, oldest: new Date(NOW - 90 * DAY) }
    results.conflicts = { status: 'ok', count: 3, oldest: new Date(NOW - DAY) }
    renderView('admin', results)
    expect(screen.getByRole('link', { name: /^תמלול שורות:/ }).querySelector('[class*="bg-warning-container"]')).toHaveTextContent('הוותיקה מלפני 3 חודשים')
    expect(screen.getByRole('link', { name: /^התנגשויות בסנכרון/ }).querySelector('.text-error')).toHaveTextContent('3')
  })

  test('מקומות ריקים — "כבר מטופל", עם משפט שלילה ולא עם התווית החיובית', () => {
    renderView('admin_ocr', ocr({ 'ocr-lines': { status: 'ok', count: 2 } }))
    const clear = screen.getByRole('region', { name: 'כבר מטופל' })
    expect(within(clear).getAllByRole('link')).toHaveLength(3)
    const volunteers = within(clear).getByRole('link', { name: 'הגהה: אין בקשות גישה של מתנדבים' })
    expect(volunteers).toHaveAttribute('href', '/library/admin/page-proof?tab=volunteers')
    for (const link of within(clear).getAllByRole('link')) expect(link.getAttribute('aria-label')).toMatch(/: אין /)
  })

  test('מקום שנכשל — טקסט קבוע, ו"נסה שוב" מרענן בלי להשבית את הכפתור (הפוקוס נשאר)', async () => {
    renderView('admin_plugins', { messages: { status: 'ok', count: 1 }, plugins: { status: 'error' } })
    expect(screen.getByText('יש מה לטפל במקום אחד · מקום אחד לא נטען')).toBeInTheDocument()
    const failed = screen.getByRole('article', { name: 'תוספים לאישור' })
    expect(failed).toHaveTextContent('לא הצלחנו לטעון את המספר')
    expect(failed).not.toHaveTextContent('undefined')
    const button = within(failed).getByRole('button', { name: 'נסה שוב' })
    await userEvent.click(button)
    expect(refresh).toHaveBeenCalled()
    expect(button).not.toBeDisabled()
  })

  test('הכול 0 — "הכול מטופל" פעם אחת, בלי הרשימה ובלי שורת סיכום', () => {
    renderView('admin_plugins', { messages: { status: 'ok', count: 0 }, plugins: { status: 'ok', count: 0 } })
    expect(screen.getByRole('heading', { name: 'הכול מטופל' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'כבר מטופל' })).not.toBeInTheDocument()
    expect(screen.queryAllByText(/מטופל/)).toHaveLength(1)
  })

  test('הכול נכשל — הודעה אחת וכפתור אחד', () => {
    renderView('admin', {})
    expect(screen.getByRole('heading', { name: 'לא הצלחנו לטעון את מה שממתין לך' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'נסה שוב' })).toHaveLength(1)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  test('תוספי שירות — רק כשהתכונה פעילה, וישר לתצוגה שלהם', () => {
    const results = { messages: { status: 'ok', count: 0 }, plugins: { status: 'ok', count: 0 }, 'service-plugins': { status: 'ok', count: 2, parts: { pendingAdmin: 2 } } }
    renderView('admin_plugins', results)
    expect(screen.getByRole('heading', { name: 'הכול מטופל' })).toBeInTheDocument()
    renderView('admin_plugins', results, { servicePlugins: true })
    expect(screen.getByRole('link', { name: 'תוספי שירות: 2 תוספי שירות מחכים לך. 2 מחכים לבדיקה' })).toHaveAttribute('href', '/library/admin/plugins?view=service')
  })

  test('תפקיד בלי מקומות — לא מוצג כלום', () => {
    const { container } = renderView('admin_books_only', {})
    expect(container).toBeEmptyDOMElement()
  })
})
