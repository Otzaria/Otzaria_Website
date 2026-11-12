import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SourceEditModal from './SourceEditModal'

beforeEach(() => {
  // reduced-motion — הסגירה מיידית, בלי טיימר אנימציית היציאה
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
})

const OPTIONS = {
  statuses: { missing_info: { label: 'חסר מידע' }, ok: { label: 'אושר' } },
  methods: { mail: { label: 'מייל' } },
  platforms: { app: { label: 'אפליקציה' }, site: { label: 'אתר' } },
}
const ITEM = {
  kind: 'book', bookTitle: 'ספר א', bookPath: 'MoreBooks/הלכה/א.txt',
  record: { ownerName: 'מוסר', status: 'ok', allowedPlatforms: ['app'] },
}
const renderIt = (props = {}) => {
  const onSave = vi.fn(async () => {})
  const onClose = vi.fn()
  const onDelete = vi.fn()
  render(<SourceEditModal item={ITEM} options={OPTIONS} onSave={onSave} onClose={onClose} onDelete={onDelete} {...props} />)
  return { onSave, onClose, onDelete }
}

describe('SourceEditModal', () => {
  it('חלון מודאלי בשם הספר, הפוקוס בתוכו, והשדות עם תוויות', () => {
    renderIt()
    const dialog = screen.getByRole('dialog', { name: 'ספר א' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('MoreBooks/הלכה/א.txt')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(screen.getAllByLabelText('שם')[0]).toHaveValue('מוסר')
    expect(screen.getByLabelText('סטטוס')).toHaveValue('ok')
    expect(screen.getByRole('checkbox', { name: 'אפליקציה' })).toBeChecked()
  })

  it('Esc סוגר', () => {
    const { onClose, onSave } = renderIt()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('שליחת הטופס (Enter בשדה) שולחת פעם אחת, עם הטופס; "משיג = בעלים" מנקה את פרטי המשיג', async () => {
    const { onSave } = renderIt()
    await userEvent.click(screen.getByRole('checkbox', { name: 'זהו אותו אדם — בעל הזכויות עצמו' }))
    const owner = screen.getByLabelText('שם')
    fireEvent.change(owner, { target: { value: 'בעלים חדש' } })
    // "שמור" (type=submit) מחובר לטופס דרך form=; user-event לא מממש Enter לכפתור כזה, ולכן שולחים את הטופס עצמו —
    // כמו שהדפדפן עושה ב-Enter (נבדק בדפדפן)
    expect(screen.getByRole('button', { name: 'שמור' })).toHaveAttribute('form', owner.form.id)
    fireEvent.submit(owner.form)
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      bookPath: 'MoreBooks/הלכה/א.txt', ownerName: 'בעלים חדש', obtainerSameAsOwner: true, obtainedBy: '', allowedPlatforms: ['app'], permissionDate: null,
    })
  })

  it('"שמור" בשורת הפעולות שולח; "מחק" אחרון וקורא ל-onDelete', async () => {
    const { onSave, onDelete } = renderIt()
    const [cancel, save, del] = ['ביטול', 'שמור', 'מחק את פרטי המקור'].map((name) => screen.getByRole('button', { name }))
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(save.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: 'מחק את פרטי המקור' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('שדות נוספים: הוספה, מילוי והסרה', async () => {
    const { onSave } = renderIt({ item: { ...ITEM, record: null } })
    expect(screen.queryByRole('button', { name: 'מחק את פרטי המקור' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'הוסף שדה' }))
    fireEvent.change(screen.getByLabelText('כותרת 1'), { target: { value: 'מספר הסכם' } })
    fireEvent.change(screen.getByLabelText('ערך 1'), { target: { value: '42' } })
    await userEvent.click(screen.getByRole('button', { name: 'הוסף שדה' }))
    await userEvent.click(screen.getByRole('button', { name: 'הסר את שדה 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].customFields).toEqual([{ label: 'מספר הסכם', value: '42' }])
    expect(onSave.mock.calls[0][0].status).toBe('missing_info')
  })
})
