import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FindReplaceDialog from './FindReplaceDialog'
import SpellcheckDialog from './SpellcheckDialog'
import SplitDialog from './SplitDialog'
import InfoDialog from './InfoDialog'
import ShortcutsDialog from './ShortcutsDialog'
import EmbedImageModal from '@/components/dicta-tools/EmbedImageModal'

vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }) }))
vi.mock('@/components/providers/LoadingContext', () => ({ useLoading: () => ({ startLoading: vi.fn(), stopLoading: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const noop = () => {}

const MODALS = [
  ['SplitDialog', 'פיצול לשני טורים', (onClose) => (
    <SplitDialog isOpen onClose={onClose} splitMode="content" setSplitMode={noop} rightColumnName="" setRightColumnName={noop} leftColumnName="" setLeftColumnName={noop} confirmSplit={noop} />
  )],
  ['InfoDialog', 'הנחיות עריכה', (onClose) => (
    <InfoDialog isOpen onClose={onClose} bookInstructions={null} globalInstructions={null} examplePage={null} bookPath="x" />
  )],
  ['ShortcutsDialog', 'קיצורי מקלדת', (onClose) => (
    <ShortcutsDialog isOpen onClose={onClose} availableActions={[{ id: 'save', label: 'שמירה' }]} shortcuts={{ save: 'Ctrl+KeyS' }} saveShortcuts={noop} resetToDefaults={noop} />
  )],
  ['EmbedImageModal', 'המרת תמונה לקוד HTML', (onClose) => (
    <EmbedImageModal isOpen onClose={onClose} content="" onContentChange={noop} />
  )],
]

describe('חלונות העורך המודאליים (ui/Dialog)', () => {
  it.each(MODALS)('%s — role=dialog מודאלי עם שם, הפוקוס בפנים, Esc סוגר', (_name, title, renderIt) => {
    const onClose = vi.fn()
    render(renderIt(onClose))
    const dialog = screen.getByRole('dialog', { name: title })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('InfoDialog — בלי הנחיות מוצג מצב ריק, והכפתור בלשון יחיד', () => {
    render(MODALS[1][2](noop))
    expect(screen.getByText('אין עדיין הנחיות לספר זה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /בוא נתחיל/ })).toBeInTheDocument()
  })
})

describe('חלונות צפים (FloatingPanel)', () => {
  it('FindReplaceDialog — role=dialog לא מודאלי, הפוקוס בשדה החיפוש, Esc סוגר', () => {
    const onClose = vi.fn()
    render(
      <FindReplaceDialog isOpen onClose={onClose} findText="" setFindText={noop} replaceText="" setReplaceText={noop}
        handleReplaceAll={noop} handleFindNext={noop} handleReplaceCurrent={noop} savedSearches={[]}
        addSavedSearch={noop} removeSavedSearch={noop} moveSearch={noop} runAllSavedReplacements={noop} handleRemoveDigits={noop} />
    )
    const dialog = screen.getByRole('dialog', { name: 'חיפוש והחלפה' })
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(screen.getByLabelText('חפש')).toHaveFocus()
    expect(screen.getByRole('button', { name: /החלפת הכול/ })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('חפש'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('FindReplaceDialog — Esc כשהפוקוס בעורך (אחרי "חפש הבא") סוגר; מחוץ לעורך / Esc שטופל — לא', () => {
    const onClose = vi.fn()
    const editor = document.createElement('div')
    editor.className = 'editor-container'
    const ta = document.createElement('textarea')
    editor.appendChild(ta)
    const outside = document.createElement('input')
    document.body.append(editor, outside)
    render(
      <FindReplaceDialog isOpen onClose={onClose} findText="" setFindText={noop} replaceText="" setReplaceText={noop}
        handleReplaceAll={noop} handleFindNext={noop} handleReplaceCurrent={noop} savedSearches={[]}
        addSavedSearch={noop} removeSavedSearch={noop} moveSearch={noop} runAllSavedReplacements={noop} handleRemoveDigits={noop} />
    )
    fireEvent.keyDown(outside, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    const handled = (e) => e.preventDefault()
    ta.addEventListener('keydown', handled)
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    ta.removeEventListener('keydown', handled)
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    editor.remove()
    outside.remove()
  })

  it('FindReplaceDialog — הרוחב לא חורג מחלון צר', () => {
    vi.stubGlobal('innerWidth', 390)
    render(
      <FindReplaceDialog isOpen onClose={noop} findText="" setFindText={noop} replaceText="" setReplaceText={noop}
        handleReplaceAll={noop} handleFindNext={noop} handleReplaceCurrent={noop} savedSearches={[]}
        addSavedSearch={noop} removeSavedSearch={noop} moveSearch={noop} runAllSavedReplacements={noop} handleRemoveDigits={noop} />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.style.width).toBe('358px')
    expect(dialog.style.left).toBe('16px')
  })

  it('SpellcheckDialog — role=dialog עם שם, Esc סוגר', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : {}
      const data = String(url).includes('/api/spellcheck') && body.action !== 'suggest' ? { misspellings: [] } : { spellWords: [], words: [], suggestions: [] }
      return { ok: true, status: 200, json: async () => data }
    }))
    const onClose = vi.fn()
    render(<SpellcheckDialog isOpen onClose={onClose} text="שלום" onApplyText={noop} title="בדיקת איות" />)
    const dialog = await screen.findByRole('dialog', { name: 'בדיקת איות' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
