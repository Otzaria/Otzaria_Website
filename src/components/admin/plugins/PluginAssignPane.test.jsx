// לשונית "שיבוץ" (מחליפה את AssignCategoriesModal): מצב מסומן לפי הקטגוריות, סימון שנשמר מיד, נעילה בזמן בקשה,
// הודעה בכשל, ומצבים בלי קטגוריות.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({ toggleCategoryPlugin: vi.fn() }))
vi.mock('./pluginsApi', () => api)

import PluginAssignPane from './PluginAssignPane'

const PLUGIN = { _id: 'p1', name: 'אלף' }
const CATEGORIES = [
  { id: 'c1', name: 'כלים', isVisible: true, plugins: [{ id: 'p1' }] },
  { id: 'c2', name: 'לימוד', isVisible: false, plugins: [] },
]

beforeEach(() => { api.toggleCategoryPlugin.mockReset() })

describe('PluginAssignPane', () => {
  test('כל הקטגוריות, מסומנות לפי השיבוץ, ומוסתרת מסומנת כך', () => {
    render(<PluginAssignPane plugin={PLUGIN} categories={CATEGORIES} toast={{ show: vi.fn() }} onCategory={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'כלים' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'לימוד' })).not.toBeChecked()
    expect(screen.getByText('מוסתרת')).toBeInTheDocument()
  })

  test('סימון נשמר מיד ומעדכן את הקטגוריה; בזמן הבקשה כל התיבות נעולות', async () => {
    let resolve
    api.toggleCategoryPlugin.mockImplementation(() => new Promise((r) => { resolve = r }))
    const onCategory = vi.fn()
    render(<PluginAssignPane plugin={PLUGIN} categories={CATEGORIES} toast={{ show: vi.fn() }} onCategory={onCategory} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'לימוד' }))
    expect(api.toggleCategoryPlugin).toHaveBeenCalledWith('c2', 'p1', true)
    expect(screen.getByRole('checkbox', { name: 'כלים' })).toBeDisabled()
    resolve({ category: { ...CATEGORIES[1], plugins: [{ id: 'p1' }] } })
    await waitFor(() => expect(onCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' })))
    expect(screen.getByRole('checkbox', { name: 'כלים' })).not.toBeDisabled()
  })

  test('כשל: הודעה בעברית', async () => {
    api.toggleCategoryPlugin.mockRejectedValue(Object.assign(new Error('לא הצלחנו לעדכן את השיבוץ.'), { status: 500 }))
    const show = vi.fn()
    render(<PluginAssignPane plugin={PLUGIN} categories={CATEGORIES} toast={{ show }} onCategory={vi.fn()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'כלים' }))
    await waitFor(() => expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', message: 'לא הצלחנו לעדכן את השיבוץ.' })))
  })

  test('בלי קטגוריות: הסבר וקישור לסידור החנות; קטגוריות שלא נטענו — הודעה', () => {
    const { rerender } = render(<PluginAssignPane plugin={PLUGIN} categories={[]} toast={{ show: vi.fn() }} onCategory={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'סידור החנות' })).toHaveAttribute('href', '/library/admin/plugins?view=layout')
    rerender(<PluginAssignPane plugin={PLUGIN} categories={null} toast={{ show: vi.fn() }} onCategory={vi.fn()} />)
    expect(screen.getByText('הקטגוריות לא נטענו')).toBeInTheDocument()
  })
})
