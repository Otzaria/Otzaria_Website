// מגירת קטגוריה: שמירה אחת ששולחת רק מה שהשתנה, כשל חלקי, ולידציה שמחוברת לשדות, אזהרת יציאה, ו"לפי הדירוג".
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const api = vi.hoisted(() => ({
  createCategory: vi.fn(), updateCategory: vi.fn(), setCategoryPlugins: vi.fn(), deleteCategory: vi.fn(),
}))
vi.mock('./pluginsApi', () => api)

import CategoryDrawer from './CategoryDrawer'

const CATEGORY = {
  id: 'c1', name: 'כלים', slug: 'tools', description: '', icon: '', showOnHome: true, homeLimit: 6, sortMode: 'manual', manualTopCount: 0,
  isVisible: true, ghostCount: 0, plugins: [{ id: 'a', name: 'אלף' }, { id: 'b', name: 'בית' }],
}

function Harness({ category, onChanged, onClose, onDirtyChange }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [open, setOpen] = useState(true)
  return (
    <>
      {open && (
        <CategoryDrawer
          category={category}
          options={[{ id: 'a', name: 'אלף' }, { id: 'b', name: 'בית' }, { id: 'c', name: 'גימל' }]}
          toast={toast}
          confirm={confirm}
          onChanged={onChanged}
          onClose={() => { setOpen(false); onClose?.() }}
          onDirtyChange={onDirtyChange}
        />
      )}
      {confirmElement}
    </>
  )
}

const renderDrawer = (props = {}) => {
  const onChanged = vi.fn(async () => {})
  const onClose = vi.fn()
  render(<ToastProvider><Harness category={CATEGORY} onChanged={onChanged} onClose={onClose} {...props} /></ToastProvider>)
  return { onChanged, onClose }
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.updateCategory.mockResolvedValue({})
  api.createCategory.mockResolvedValue({})
  api.setCategoryPlugins.mockImplementation(async (_, ids) => ({ category: { plugins: ids.map((id) => ({ id, name: id })) } }))
})

describe('CategoryDrawer', () => {
  test('כפתור שמירה אחד: מושבת בלי שינוי, ושולח רק את מה שהשתנה', async () => {
    const user = userEvent.setup()
    const { onChanged } = renderDrawer()
    const save = screen.getByRole('button', { name: 'שמור שינויים' })
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('תיאור'), 'טקסט')
    await user.click(save)
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledTimes(1))
    expect(api.setCategoryPlugins).not.toHaveBeenCalled()
    expect(await screen.findByText('הקטגוריה נשמרה')).toBeInTheDocument()
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  test('שינוי בשני החלקים: שתי הבקשות, פעם אחת', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.type(screen.getByLabelText('תיאור'), 'טקסט')
    await user.click(screen.getByRole('button', { name: 'הזז למטה: אלף' }))
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    await waitFor(() => expect(api.setCategoryPlugins).toHaveBeenCalledWith('c1', ['b', 'a']))
    expect(api.updateCategory).toHaveBeenCalledTimes(1)
  })

  test('אחרי שמירה של מספר (מחרוזת מול מספר): אין "לא נשמר", והסגירה לא שואלת', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer()
    const limit = screen.getByLabelText('כמה תוספים בשורה בדף הבית')
    await user.clear(limit)
    await user.type(limit, '7')
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    await screen.findByText('הקטגוריה נשמרה')
    await waitFor(() => expect(screen.queryByText('יש שינויים שלא נשמרו')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'סגירה' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'לצאת בלי לשמור?' })).toBeNull()
  })

  test('כשל חלקי: הפרטים נשמרו והתוספים לא — נאמר, ושמירה נוספת שולחת רק את התוספים', async () => {
    const user = userEvent.setup()
    api.setCategoryPlugins.mockRejectedValueOnce(new Error('התוספים נכשלו'))
    renderDrawer()
    await user.type(screen.getByLabelText('תיאור'), 'טקסט')
    await user.click(screen.getByRole('button', { name: 'הזז למטה: אלף' }))
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(await screen.findByText(/הפרטים נשמרו, אבל התוספים בקטגוריה לא\. התוספים נכשלו/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    await waitFor(() => expect(api.setCategoryPlugins).toHaveBeenCalledTimes(2))
    expect(api.updateCategory).toHaveBeenCalledTimes(1)
  })

  test('שמירה הצליחה ורענון נכשל: לא מדווח ככשל של השמירה', async () => {
    const user = userEvent.setup()
    renderDrawer({ onChanged: vi.fn(async () => { throw new Error('נפל') }) })
    await user.type(screen.getByLabelText('תיאור'), 'טקסט')
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(await screen.findByText('הקטגוריה נשמרה')).toBeInTheDocument()
    expect(await screen.findByText(/השינוי נשמר, אבל לא הצלחנו לרענן/)).toBeInTheDocument()
    expect(screen.queryByText(/לא הצלחנו לשמור/)).toBeNull()
  })

  test('יצירה בלי שם וכתובת: השגיאות מחוברות לשדה, והפוקוס עובר אליו', async () => {
    const user = userEvent.setup()
    renderDrawer({ category: null })
    await user.click(screen.getByRole('button', { name: 'צור קטגוריה' }))
    const name = screen.getByLabelText('שם')
    expect(name).toHaveFocus()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('כתוב שם לקטגוריה.')
    expect(api.createCategory).not.toHaveBeenCalled()
  })

  test('הרמזים מחוברים לשדות', () => {
    renderDrawer()
    expect(screen.getByLabelText('תיאור')).toHaveAccessibleDescription('לא חובה. מוצג בראש דף הקטגוריה.')
  })

  test('שינוי כתובת שואל קודם', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.type(screen.getByLabelText('כתובת הדף'), '-new')
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(await screen.findByRole('dialog', { name: 'לשנות את הכתובת?' })).toBeInTheDocument()
    expect(api.updateCategory).not.toHaveBeenCalled()
  })

  test('סגירה עם שינוי שואלת, ו"הישאר" משאיר; השינוי מדווח למסך', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    const { onClose } = renderDrawer({ onDirtyChange })
    await user.type(screen.getByLabelText('תיאור'), 'טקסט')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'סגירה' }))
    await user.click(await screen.findByRole('button', { name: 'הישאר' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  test('"לפי הדירוג" בלי תוספים קבועים: אין מה לסדר, והזזה לא מסמנת שינוי', async () => {
    renderDrawer({ category: { ...CATEGORY, sortMode: 'rating' } })
    expect(screen.getByText(/הסדר נקבע לפי הדירוג/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^הזז/ })).toBeNull()
  })

  test('"לפי הדירוג" עם תוספים קבועים: אפשר לסדר', () => {
    renderDrawer({ category: { ...CATEGORY, sortMode: 'rating', manualTopCount: 1 } })
    expect(screen.getByRole('button', { name: 'הזז למטה: אלף' })).toBeInTheDocument()
  })

  test('תוסף שנמחק ורשום בקטגוריה: אפשר לשמור בלי שינוי אחר, והוא מוסר', async () => {
    const user = userEvent.setup()
    renderDrawer({ category: { ...CATEGORY, ghostCount: 1 } })
    expect(screen.getByText('תוסף אחד שנמחק עדיין רשום כאן. הוא יוסר בשמירה.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    await waitFor(() => expect(api.setCategoryPlugins).toHaveBeenCalledWith('c1', ['a', 'b']))
  })

  test('מחיקה: חלון אישור, סגירה, והודעה', async () => {
    const user = userEvent.setup()
    api.deleteCategory.mockResolvedValue({})
    const { onClose } = renderDrawer()
    await user.click(screen.getByRole('button', { name: 'מחק קטגוריה' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'למחוק את הקטגוריה?' })).getByRole('button', { name: 'מחק קטגוריה' }))
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await screen.findByText('הקטגוריה ״כלים״ נמחקה')).toBeInTheDocument()
  })
})
