import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManualSourcePicker from './ManualSourcePicker'

const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/חזון איש.txt'
const preview = { path: PATH, lineIndex: 4, line: 'שורה', neighbors: [{ lineIndex: 4, text: 'שורה' }] }

const setup = (over = {}) => {
  const props = {
    busy: false,
    run: vi.fn(async () => preview),
    probe: vi.fn(async () => ({ ok: true, data: { lineCount: 120 } })),
    pick: null,
    preview: null,
    onPreview: vi.fn(),
    onEdit: vi.fn(),
    ...over,
  }
  render(<ManualSourcePicker {...props} />)
  return props
}
const pathInput = () => screen.getByPlaceholderText(/ToratEmetToOtzaria/)
const lineInput = () => screen.getByPlaceholderText('שורה')

describe('בחירת מקור ידנית', () => {
  it('הסמן בשדה הנתיב בפתיחה', () => {
    setup()
    expect(document.activeElement).toBe(pathInput())
  })

  it('שגיאה בשם הספר מוצגת ליד השדות עוד לפני מספר השורה', async () => {
    const p = setup({ probe: vi.fn(async () => ({ ok: false, data: { error: 'file_not_found' } })) })
    fireEvent.change(pathInput(), { target: { value: PATH } })
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveProperty('textContent', 'הקובץ לא נמצא במאגר — בדקו את שם הספר והנתיב.')
    expect(p.probe).toHaveBeenCalledWith({ action: 'check_source_path', path: PATH })
    expect(lineInput().value).toBe('')
  })

  it('נתיב תקין: מספר השורות מוצג, ושורה מעבר לסוף מסומנת בלי לשלוח', async () => {
    const p = setup()
    fireEvent.change(pathInput(), { target: { value: PATH } })
    expect(await screen.findByText('הקובץ נמצא (120 שורות).', {}, { timeout: 2000 })).toBeTruthy()
    fireEvent.change(lineInput(), { target: { value: '500' } })
    expect(screen.getByRole('alert').textContent).toBe('מספר השורה גדול ממספר השורות בקובץ (120).')
    expect(screen.getByRole('button', { name: 'טעינת השורה' }).disabled).toBe(true)
    expect(p.run).not.toHaveBeenCalled()
  })

  it('שגיאת טעינה מוצגת ליד השדות', async () => {
    const p = setup({ probe: undefined, run: vi.fn(async () => ({ errorText: 'לא ניתן לקרוא את המקור מ-GitHub כרגע.' })) })
    fireEvent.change(pathInput(), { target: { value: PATH } })
    fireEvent.change(lineInput(), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'טעינת השורה' }))
    expect((await screen.findByRole('alert')).textContent).toBe('לא ניתן לקרוא את המקור מ-GitHub כרגע.')
    expect(p.onPreview).toHaveBeenCalledWith(null)
  })

  it('בחירת מועמד ממלאת את השדות וטוענת את השורה מיד', async () => {
    const p = setup({ pick: { path: PATH, lineIndex: 4, key: 1 } })
    expect(pathInput().value).toBe(PATH)
    expect(lineInput().value).toBe('5')
    await waitFor(() => expect(p.run).toHaveBeenCalledWith({ action: 'preview_source', path: PATH, lineIndex: 4 }, { keep: true, quiet: true }))
    await waitFor(() => expect(p.onPreview).toHaveBeenCalledWith(preview))
  })

  it('ספר שאותר במאגר נבחר מראש: הסמן בשדה השורה, ואפשר לשנות את הספר', async () => {
    setup({ knownPath: PATH })
    expect(pathInput().value).toBe(PATH)
    expect(pathInput().hidden).toBe(true)
    expect(screen.getByText(PATH)).toBeTruthy()
    expect(document.activeElement).toBe(lineInput())
    fireEvent.click(screen.getByRole('button', { name: 'שינוי ספר' }))
    expect(pathInput().hidden).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(pathInput()))
  })

  it('אנטר בשדה השורה טוען את השורה', async () => {
    const p = setup({ knownPath: PATH, probe: undefined })
    await userEvent.type(lineInput(), '5{Enter}')
    await waitFor(() => expect(p.run).toHaveBeenCalledWith({ action: 'preview_source', path: PATH, lineIndex: 4 }, { keep: true, quiet: true }))
  })
})
