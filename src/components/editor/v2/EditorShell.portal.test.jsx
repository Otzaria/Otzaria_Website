import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import EditorShell from './EditorShell'
import Dialog from '@/components/ui/Dialog'
import CommandPalette from '@/components/ui/CommandPalette'

function Shell({ children }) {
  return (
    <EditorShell theme="evening" topBar={<div />} scanSize={50} onScanSizeChange={() => {}} onSplitterPointer={() => {}} scan={<div />} text={<div />}>
      {children}
    </EditorShell>
  )
}

describe('EditorShell — חלונות ב-portal לשורש העורך', () => {
  it('ui/Dialog שפתוח כבר בטעינה מצויר בתוך שורש העורך (מקבל את הערכה), ו-Esc סוגר', () => {
    const onClose = vi.fn()
    render(<Shell><Dialog title="חלון" onClose={onClose}>תוכן</Dialog></Shell>)
    const dialog = screen.getByRole('dialog', { name: 'חלון' })
    expect(dialog.closest('[data-editor-shell]')).toHaveAttribute('data-editor-theme', 'evening')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('חלון הפקודות מצויר בתוך שורש העורך', () => {
    function WithPalette() {
      const [open, setOpen] = useState(true)
      return <Shell><CommandPalette open={open} onClose={() => setOpen(false)} commands={[]} /></Shell>
    }
    render(<WithPalette />)
    expect(screen.getByRole('dialog').closest('[data-editor-shell]')).not.toBeNull()
  })

  it('מחוץ לעורך — ui/Dialog נשאר ב-body', () => {
    render(<Dialog title="באתר" onClose={() => {}}>תוכן</Dialog>)
    expect(screen.getByRole('dialog', { name: 'באתר' }).closest('[data-editor-shell]')).toBeNull()
  })
})
