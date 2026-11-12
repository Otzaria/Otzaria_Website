import { describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import ConfirmDialog, { useConfirm } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  test('הרסני: הפוקוס הראשון על "ביטול", והאישור קורא ל-onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="למחוק לצמיתות?" body="אי אפשר לשחזר." confirmLabel="מחק לצמיתות" tone="danger" onConfirm={onConfirm} onCancel={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'למחוק לצמיתות?' })
    expect(dialog).toHaveTextContent('אי אפשר לשחזר.')
    expect(screen.getByRole('button', { name: 'ביטול' })).toHaveFocus()
    await userEvent.setup().click(screen.getByRole('button', { name: 'מחק לצמיתות' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('details — רשימה בגוף; busy — אי אפשר לסגור, והאישור בטעינה', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog title="לאפס את עותק העריכה?" body={<strong>חוות דעת</strong>} details={['כל העריכות יימחקו', 'אי אפשר לשחזר']} confirmLabel="אפס עותק" busyLabel="מאפס…" busy tone="danger" onConfirm={vi.fn()} onCancel={onCancel} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['כל העריכות יימחקו', 'אי אפשר לשחזר'])
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'סגירה' })).not.toBeInTheDocument()
    await userEvent.setup().keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /מאפס/ })).toBeInTheDocument()
  })

  test('רגיל: הפוקוס על כפתור האישור', () => {
    render(<ConfirmDialog title="ליצור עותק?" confirmLabel="צור עותק" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'צור עותק' })).toHaveFocus()
  })
})

function Harness({ onAnswer }) {
  const [confirm, element] = useConfirm()
  const [asked, setAsked] = useState(0)
  return (
    <>
      <button type="button" onClick={async () => { setAsked((n) => n + 1); onAnswer(await confirm({ title: 'לרוקן את האשפה?', confirmLabel: 'רוקן אשפה', tone: 'danger' })) }}>
        שאל {asked}
      </button>
      {element}
    </>
  )
}

describe('useConfirm', () => {
  test('מסך שיורד כשהדיאלוג פתוח — ההבטחה נפתרת ב-false', async () => {
    const onAnswer = vi.fn()
    const { unmount } = render(<Harness onAnswer={onAnswer} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /שאל/ }))
    unmount()
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
  })

  test('מחזיר true באישור ו-false בביטול / Esc', async () => {
    const onAnswer = vi.fn()
    render(<Harness onAnswer={onAnswer} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /שאל/ }))
    await user.click(screen.getByRole('button', { name: 'רוקן אשפה' }))
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /שאל/ }))
    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith(false))

    await user.click(screen.getByRole('button', { name: /שאל/ }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(3))
    expect(onAnswer).toHaveBeenLastCalledWith(false)
  })
})
