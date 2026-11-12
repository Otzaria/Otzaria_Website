import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OutreachEditModal from './OutreachEditModal'

beforeEach(() => {
  // reduced-motion — הסגירה מיידית, בלי טיימר אנימציית היציאה
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
})

const STATUSES = { pending: { label: 'ממתין' }, open: { label: 'פתוחה' } }
const EXISTING = { _id: 'o1', contactName: 'ישראל', contactPhone: '050-1234567', status: 'open', outreachDate: new Date().toISOString() }
const renderIt = (props = {}) => {
  const onSave = vi.fn(async () => ({ success: true }))
  const onClose = vi.fn()
  const onDelete = vi.fn()
  render(<OutreachEditModal item={null} allItems={[EXISTING]} statuses={STATUSES} channels={{}} defaultOutreachBy="דוד"
    onSave={onSave} onClose={onClose} onDelete={onDelete} {...props} />)
  return { onSave, onClose, onDelete }
}

describe('OutreachEditModal', () => {
  it('פנייה חדשה: חלון מודאלי, הפוקוס בתוכו, "מי פונה" = המשתמש, בלי "מחק"', () => {
    renderIt()
    const dialog = screen.getByRole('dialog', { name: 'פנייה חדשה למכון' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(screen.getByLabelText('מי פונה')).toHaveValue('דוד')
    expect(screen.queryByRole('button', { name: 'מחק את הפנייה' })).toBeNull()
  })

  it('Esc סוגר בלי לשמור', () => {
    const { onClose, onSave } = renderIt()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('כפילות תוך כדי הקלדה: אזהרה; Enter לא מאשר כפילות, רק לחיצה על "שמור בכל זאת"', async () => {
    const { onSave } = renderIt()
    fireEvent.change(screen.getByLabelText('איש קשר'), { target: { value: 'ישראל' } })
    expect(await screen.findByText('שים לב — כבר פנו לנמען הזה!')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('button', { name: 'שמור בכל זאת' })
    const reason = screen.getByLabelText('נימוק לפנייה נוספת (לא חובה)')
    fireEvent.change(reason, { target: { value: 'תיאום' } })
    // שליחת הטופס (Enter בשדה) — נשלח בלי אישור כפילות, כך שהשרת יחסום
    fireEvent.submit(reason.form)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ confirmDuplicate: false })
    // הכפתור אינו כפתור submit — Enter לא "לוחץ" עליו
    expect(confirmBtn).toHaveAttribute('type', 'button')
    await userEvent.click(confirmBtn)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[1][0]).toMatchObject({ contactName: 'ישראל', duplicateReason: 'תיאום', confirmDuplicate: true, outreachBy: 'דוד' })
  })

  it('עריכה: "שמור" שולח עם _id, ו"מחק" אחרון וקורא ל-onDelete', async () => {
    const { onSave, onDelete } = renderIt({ item: { _id: 'o2', instituteName: 'מכון', status: 'pending' }, allItems: [] })
    expect(screen.getByRole('dialog', { name: 'עריכת פנייה' })).toBeInTheDocument()
    const [cancel, save, del] = ['ביטול', 'שמור', 'מחק את הפנייה'].map((name) => screen.getByRole('button', { name }))
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(save.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ _id: 'o2', instituteName: 'מכון', confirmDuplicate: false })
    await userEvent.click(screen.getByRole('button', { name: 'מחק את הפנייה' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
