import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import UnboundShortcutsNotice, { unboundShortcutMessage } from './UnboundShortcutsNotice'

afterEach(cleanup)

const labels = { imageToText: 'תמונה לטקסט', bold: 'הדגשה' }
const labelOf = (id) => labels[id] || id
const ITEM = { actionId: 'imageToText', from: 'Ctrl+Shift+KeyI', to: 'Alt+KeyI', conflictWith: 'bold' }

describe('UnboundShortcutsNotice', () => {
  it('ההודעה מזכירה את הפעולה, הקיצור שהוסר, הקיצור התפוס ומי משתמש בו', () => {
    const msg = unboundShortcutMessage(ITEM, labelOf)
    expect(msg).toContain('"תמונה לטקסט"')
    expect(msg).toContain('Ctrl+Shift+I')
    expect(msg).toContain('Alt+I')
    expect(msg).toContain('"הדגשה"')
    expect(msg).toContain('בלי קיצור')
  })

  it('בלי פריטים — לא מצויר', () => {
    const { container } = render(<UnboundShortcutsNotice items={[]} labelOf={labelOf} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('role=status, וכפתור "הבנתי" סוגר', () => {
    const onDismiss = vi.fn()
    render(<UnboundShortcutsNotice items={[ITEM]} labelOf={labelOf} onDismiss={onDismiss} />)
    expect(screen.getByRole('status')).toHaveTextContent('תמונה לטקסט')
    fireEvent.click(screen.getByRole('button', { name: 'הבנתי' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
