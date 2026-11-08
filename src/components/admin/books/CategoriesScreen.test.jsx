// לשונית "קטגוריות" (עם fetch מדומה): שינוי שם שמעביר ספרים ומעדכן את הספירה בזיכרון, שמירה שנכשלה
// באמצע (מדווחת כחלקית, והרשימה לא נשמרת), "כללי" נעולה עם סיבה גלויה, וחסימת שינוי שם כשהספרים לא נטענו.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))

import CategoriesScreen from './CategoriesScreen'

vi.setConfig({ testTimeout: 20000 })

const CATEGORIES = [{ name: 'כללי', color: '#eedddd' }, { name: 'חסידות', color: '#38571a' }, { name: 'ריקה', color: '#3b82f6' }]
const BOOKS = [
  { id: 'a', name: 'תניא', category: 'חסידות' },
  { id: 'b', name: 'קדושת לוי', category: 'חסידות' },
  { id: 'c', name: 'ספר כללי', category: 'כללי' },
]

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
let handler
beforeEach(() => {
  calls = []
  handler = null
  global.fetch = vi.fn(async (url, options = {}) => {
    const call = { url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null }
    calls.push(call)
    const r = handler?.(call)
    if (r) return r
    return json({ success: true })
  })
})

const renderScreen = (props = {}) => render(
  <ToastProvider>
    <CategoriesScreen initialCategories={CATEGORIES} initialBooks={BOOKS} {...props} />
  </ToastProvider>
)
const rowOf = (name) => screen.getAllByRole('listitem').find((li) => within(li).queryByRole('textbox')?.value === name)
const nameInput = (name) => within(rowOf(name)).getByRole('textbox')

describe('CategoriesScreen', () => {
  test('שינוי שם: הספרים עוברים, ואחרי השמירה הספירה בשם החדש וההסרה עדיין חסומה', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.clear(nameInput('חסידות'))
    await user.type(nameInput(''), 'חסידות חדש')
    await user.click(screen.getByRole('button', { name: 'שמור' }))
    const dialog = screen.getByRole('dialog', { name: 'לשנות את שם הקטגוריה?' })
    await user.click(within(dialog).getByRole('button', { name: 'שנה שם והעבר' }))
    await screen.findByText('הקטגוריות נשמרו, ו-2 ספרים עברו לשם החדש.')
    // קודם הספרים, ורק בסוף הרשימה
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PUT', 'POST'])
    expect(calls.at(-1).body.categories.map((c) => c.name)).toEqual(['כללי', 'חסידות חדש', 'ריקה'])
    const row = rowOf('חסידות חדש')
    expect(within(row).getAllByText('2 ספרים').length).toBeGreaterThan(0)
    expect(within(row).getByRole('button', { name: 'הסר את חסידות חדש' })).toBeDisabled()
  })

  test('שמירה שנכשלה באמצע: מדווחת כחלקית, הרשימה לא נשמרת, ו"שמור" שוב ממשיך', async () => {
    const user = userEvent.setup()
    handler = (call) => (call.method === 'PUT' && call.body.bookId === 'b' ? json({ success: false, error: 'תקלה' }, { status: 500 }) : null)
    renderScreen()
    await user.clear(nameInput('חסידות'))
    await user.type(nameInput(''), 'חסידות חדש')
    await user.click(screen.getByRole('button', { name: 'שמור' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'שנה שם והעבר' }))
    await screen.findByText(/^1 מתוך 2 ספרים עברו לשם החדש, והקטגוריות עוד לא נשמרו/)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    expect(screen.getByText('יש שינויים שלא נשמרו')).toBeInTheDocument()

    handler = null
    calls = []
    await user.click(screen.getByRole('button', { name: 'שמור' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'שנה שם והעבר' }))
    await screen.findByText('הקטגוריות נשמרו, וספר אחד עבר לשם החדש.')
    expect(calls.map((c) => [c.method, c.body.bookId])).toEqual([['PUT', 'b'], ['POST', undefined]])
  })

  test('"כללי": השם נעול, והסיבה כתובה בשורה', () => {
    renderScreen()
    const input = nameInput('כללי')
    expect(input).toHaveAttribute('readonly')
    expect(within(rowOf('כללי')).getByText(/ברירת המחדל לספרים חדשים/)).toBeVisible()
    expect(within(rowOf('כללי')).getByRole('button', { name: 'הסר את כללי' })).toBeDisabled()
  })

  test('הספרים לא נטענו: אי אפשר לשנות שם של קטגוריה קיימת או למחוק, אבל אפשר להוסיף', async () => {
    const user = userEvent.setup()
    renderScreen({ initialBooks: [], initialError: true })
    expect(screen.getByText(/אי אפשר לשנות שם של קטגוריה קיימת או למחוק/)).toHaveAttribute('role', 'alert')
    expect(nameInput('חסידות')).toHaveAttribute('readonly')
    expect(within(rowOf('ריקה')).getByRole('button', { name: 'הסר את ריקה' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'הוסף קטגוריה' }))
    await user.type(nameInput(''), 'חדשה')
    await user.click(screen.getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(calls.map((c) => c.method)).toEqual(['POST']))
  })

  // מה ש-next/link היה מקבל: לחיצה שלא נעצרה בדרך
  const trackLinks = () => {
    const reached = []
    const onClick = (event) => {
      const link = event.target.closest('a')
      if (!link) return
      event.preventDefault()
      reached.push(link.getAttribute('href'))
    }
    document.addEventListener('click', onClick)
    return { reached, stop: () => document.removeEventListener('click', onClick) }
  }

  test('שינויים שלא נשמרו: מעבר ללשונית אחרת שואל — "הישאר" נשאר, "צא" עובר', async () => {
    const user = userEvent.setup()
    const { reached, stop } = trackLinks()
    renderScreen()
    await user.click(screen.getByRole('link', { name: 'מנויים' }))
    expect(reached).toEqual(['/library/admin/books/subscribers'])
    expect(screen.queryByRole('dialog')).toBeNull()
    reached.length = 0
    await user.type(nameInput('ריקה'), ' מאוד')
    await user.click(screen.getByRole('link', { name: 'מנויים' }))
    await user.click(within(screen.getByRole('dialog', { name: 'לצאת בלי לשמור?' })).getByRole('button', { name: 'הישאר' }))
    expect(reached).toEqual([])
    expect(nameInput('ריקה מאוד')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'מנויים' }))
    await user.click(within(screen.getByRole('dialog', { name: 'לצאת בלי לשמור?' })).getByRole('button', { name: 'צא בלי לשמור' }))
    await waitFor(() => expect(reached).toEqual(['/library/admin/books/subscribers']))
    stop()
  })

  test('קישור מחוץ למסך (הסרגל) — גם הוא שואל', async () => {
    const user = userEvent.setup()
    const { reached, stop } = trackLinks()
    const sidebar = document.createElement('a')
    sidebar.href = '/library/admin/users'
    sidebar.textContent = 'משתמשים'
    document.body.append(sidebar)
    renderScreen()
    await user.type(nameInput('ריקה'), ' מאוד')
    await user.click(sidebar)
    await user.click(within(screen.getByRole('dialog', { name: 'לצאת בלי לשמור?' })).getByRole('button', { name: 'הישאר' }))
    expect(reached).toEqual([])
    sidebar.remove()
    stop()
  })
})
