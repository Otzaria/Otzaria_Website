import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubmitDialog from './SubmitDialog'
import { SUBMIT_CHOICE, SUBMIT_ERRORS, planSubmission, submitSummary } from '@/lib/pageProof/submitPlan'
import { buildView } from '@/lib/pageProof/ops'
import { untouchedLineIds } from '@/lib/pageProof/view'

const summary = (over = {}) => ({
  approval: { approved: 2, total: 5 },
  opCount: 3,
  restCount: 4,
  allApproved: false,
  choices: [SUBMIT_CHOICE.APPROVE_REST, SUBMIT_CHOICE.ONLY_APPROVED],
  recut: false,
  recheckCount: 0,
  ...over,
})

const renderDialog = (props = {}) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  const onNote = vi.fn()
  render(<SubmitDialog pageNo={12} summary={summary()} onSubmit={onSubmit} onCancel={onCancel} onNote={onNote} {...props} />)
  return { onSubmit, onCancel, onNote }
}

describe('SubmitDialog — חלון ההגשה', () => {
  it('הכול אושר: רק "הגש", עם מונה הפסקאות', async () => {
    const { onSubmit } = renderDialog({ summary: summary({ approval: { approved: 5, total: 5 }, allApproved: true, restCount: 0, choices: [SUBMIT_CHOICE.SUBMIT] }) })
    expect(screen.getByRole('dialog', { name: 'הגשת עמוד 12' })).toBeInTheDocument()
    expect(screen.getByText('אושרו 5 מתוך 5 פסקאות')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'אשר גם את כל השאר והגש' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'הגש רק את מה שאישרתי' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'הגש' }))
    expect(onSubmit).toHaveBeenCalledWith(SUBMIT_CHOICE.SUBMIT, { readAll: false })
  })

  it('לא הכול אושר: "אשר גם את כל השאר" חסום עד "קראתי את כל הטקסט בעמוד"', async () => {
    const { onSubmit } = renderDialog()
    expect(screen.getByText('אושרו 2 מתוך 5 פסקאות')).toBeInTheDocument()
    const rest = screen.getByRole('button', { name: 'אשר גם את כל השאר והגש' })
    expect(rest).toBeDisabled()
    await userEvent.click(rest)
    expect(onSubmit).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('checkbox', { name: 'קראתי את כל הטקסט בעמוד' }))
    expect(rest).toBeEnabled()
    await userEvent.click(rest)
    expect(onSubmit).toHaveBeenCalledWith(SUBMIT_CHOICE.APPROVE_REST, { readAll: true })
  })

  it('"הגש רק את מה שאישרתי" — בלי צורך בסימון', async () => {
    const { onSubmit } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' }))
    expect(onSubmit).toHaveBeenCalledWith(SUBMIT_CHOICE.ONLY_APPROVED, { readAll: false })
  })

  it('הגשה ריקה: "רק את מה שאישרתי" חסום, עם הסבר בעברית', () => {
    renderDialog({ summary: summary({ opCount: 0, approval: { approved: 0, total: 5 } }) })
    expect(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' })).toBeDisabled()
    expect(screen.getByText(SUBMIT_ERRORS.emptyOnly)).toBeInTheDocument()
    expect(screen.getByText('אין שינויים')).toBeInTheDocument()
  })

  it('מעבר שני וחיתוך — הודעות; שגיאה מהשרת מוצגת', () => {
    renderDialog({ summary: summary({ recheckCount: 3, recut: true }), error: 'העמוד כבר הוגש' })
    expect(screen.getByText(/3 שורות זוהו מחדש/)).toBeInTheDocument()
    expect(screen.getByText(/תיקנתם את חיתוך השורות/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('העמוד כבר הוגש')
  })

  it('ביטול: כפתור, Esc ולחיצה על הרקע; לא בזמן שליחה', async () => {
    const { onCancel } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('dialog').parentElement)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('בזמן שליחה: הכפתורים חסומים ו-Esc לא סוגר', async () => {
    const { onCancel } = renderDialog({ saving: true })
    expect(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('הערה למנהל', async () => {
    const { onNote } = renderDialog()
    await userEvent.type(screen.getByLabelText('הערה למנהל (לא חובה)'), 'א')
    expect(onNote).toHaveBeenCalledWith('א')
  })
})

// ההחלטה המלאה, כמו בדף המתנדב: submitSummary ← החלון ← planSubmission —
// אילו פעולות נשלחות לכל בחירה
describe('SubmitDialog + submitPlan — מה נשלח', () => {
  const P = 9
  const line = (id, stream = 'main') => ({ id, order: id, line_no: id - 1, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream })
  const doc = { page: P, size: [1000, 2000], lines: [line(1), line(2), line(3, 'notes'), line(4, 'header')], frames: [], links: [] }

  function Harness({ ops, approval, onSend }) {
    const [error, setError] = useState(null)
    const ctx = { baseDoc: doc, ops, untouched: untouchedLineIds(buildView(doc, ops)) }
    return (
      <SubmitDialog
        pageNo={P}
        summary={submitSummary({ ...ctx, approval })}
        error={error}
        onCancel={() => {}}
        onSubmit={(choice, { readAll }) => {
          const plan = planSubmission({ ...ctx, choice, readAll })
          if (plan.ok) onSend(plan.ops)
          else setError(plan.error)
        }}
      />
    )
  }

  const approved = [{ kind: 'line_ok', page: P, ids: [1, 2], _g: 'g1' }]

  it('"אשר גם את כל השאר": הפעולות + line_ok לשורות-התוכן שלא נגעו בהן', async () => {
    const onSend = vi.fn()
    render(<Harness ops={approved} approval={{ approved: 1, total: 2 }} onSend={onSend} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'קראתי את כל הטקסט בעמוד' }))
    await userEvent.click(screen.getByRole('button', { name: 'אשר גם את כל השאר והגש' }))
    // אישורי-השורות מאוחדים לפעולה אחת (ops.packOps — כמו שהשרת שומר)
    expect(onSend).toHaveBeenCalledWith([{ kind: 'line_ok', page: P, ids: [1, 2, 3] }])
  })

  it('"הגש רק את מה שאישרתי": הפעולות כמות-שהן, בלי line_ok נוסף', async () => {
    const onSend = vi.fn()
    render(<Harness ops={approved} approval={{ approved: 1, total: 2 }} onSend={onSend} />)
    await userEvent.click(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' }))
    expect(onSend).toHaveBeenCalledWith([{ kind: 'line_ok', page: P, ids: [1, 2] }])
  })

  it('כל הפסקאות אושרו: "הגש" שולח את האישורים', async () => {
    const onSend = vi.fn()
    const all = [{ kind: 'line_ok', page: P, ids: [1, 2] }, { kind: 'line_ok', page: P, ids: [3] }]
    render(<Harness ops={all} approval={{ approved: 2, total: 2 }} onSend={onSend} />)
    await userEvent.click(screen.getByRole('button', { name: 'הגש' }))
    expect(onSend).toHaveBeenCalledWith([{ kind: 'line_ok', page: P, ids: [1, 2, 3] }])
  })

  it('בלי שום פעולה ובלי אישור: אי-אפשר להגיש "רק את מה שאישרתי"', async () => {
    const onSend = vi.fn()
    render(<Harness ops={[]} approval={{ approved: 0, total: 2 }} onSend={onSend} />)
    expect(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' })).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
  })
})
