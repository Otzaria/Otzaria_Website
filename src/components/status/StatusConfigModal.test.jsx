// הגדרות מצבים: אישור מחיקה בדיאלוג האישור האחיד (ולא showConfirm הישן), ושגיאה בשורת ההוספה.
import { describe, expect, test, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatusConfigModal from './StatusConfigModal'

const STATUSES = { not_checked: { label: 'לא נבדק', color: '#94a3b8' }, ready: { label: 'מוכן', color: '#10b981' } }

describe('StatusConfigModal', () => {
  test('מחיקת מצב בשימוש: דיאלוג אישור הרסני עם המספר, פוקוס על "ביטול"; אישור מסיר', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <StatusConfigModal statuses={STATUSES} uploads={[{ bookStatus: 'ready' }, { bookStatus: 'ready' }]} itemNoun="מצב"
        usageNoun="העלאות" deleteConfirmQuestion="למחוק את המצב?" onSave={onSave} onClose={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: 'מחק את מוכן' }))
    const confirm = screen.getByRole('dialog', { name: 'למחוק את המצב?' })
    expect(confirm).toHaveTextContent('ל-2 העלאות')
    expect(within(confirm).getByRole('button', { name: 'ביטול' })).toHaveFocus()
    await user.click(within(confirm).getByRole('button', { name: 'מחק בכל זאת' }))
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(onSave).toHaveBeenCalledWith({ not_checked: STATUSES.not_checked })
  })

  test('הוספה בלי מפתח — שגיאה מתחת לשורה, בלי חלון', async () => {
    const user = userEvent.setup()
    render(<StatusConfigModal statuses={STATUSES} onSave={vi.fn()} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'הוסף' }))
    expect(screen.getByRole('alert')).toHaveTextContent('צריך למלא מפתח ותווית.')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
  test('שמירה באוויר — "שומר…" בלי לאבד פוקוס, ולחיצה נוספת לא שולחת שוב; כישלון — אפשר לשמור שוב', async () => {
    const user = userEvent.setup()
    let finish
    const onSave = vi.fn(() => new Promise((resolve, reject) => { finish = { resolve, reject } }))
    render(<StatusConfigModal statuses={STATUSES} onSave={onSave} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    const saving = screen.getByRole('button', { name: 'שומר…' })
    expect(saving).toHaveAttribute('aria-disabled', 'true')
    expect(saving).not.toBeDisabled()
    await user.click(saving)
    expect(onSave).toHaveBeenCalledTimes(1)
    await act(async () => { finish.reject(new Error('x')) })
    expect(await screen.findByRole('button', { name: 'שמור שינויים' })).not.toHaveAttribute('aria-disabled')
  })
})
