import { describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SearchField from './SearchField'

describe('SearchField', () => {
  test('מעדכן אחרי השהיה, Enter מיד, וכפתור הניקוי מנקה', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    const { rerender } = render(<SearchField label="חיפוש לפי שם ספר" value="" onSearch={onSearch} delay={250} />)
    const input = screen.getByRole('searchbox', { name: 'חיפוש לפי שם ספר' })
    fireEvent.change(input, { target: { value: 'חוות' } })
    expect(onSearch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(260))
    expect(onSearch).toHaveBeenLastCalledWith('חוות')
    rerender(<SearchField label="חיפוש לפי שם ספר" value="חוות" onSearch={onSearch} delay={250} />)

    fireEvent.change(input, { target: { value: 'חוות דעת ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSearch).toHaveBeenLastCalledWith('חוות דעת')

    fireEvent.click(screen.getByRole('button', { name: 'נקה חיפוש' }))
    expect(onSearch).toHaveBeenLastCalledWith('')
    vi.useRealTimers()
  })

  test('ערך חדש מבחוץ ("נקה סינון") מחליף את הטיוטה', () => {
    const { rerender } = render(<SearchField label="חיפוש" value="אבג" onSearch={vi.fn()} />)
    expect(screen.getByRole('searchbox')).toHaveValue('אבג')
    rerender(<SearchField label="חיפוש" value="" onSearch={vi.fn()} />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  test('מקש "/" מתמקד בשדה — אבל לא מתוך שדה אחר', () => {
    render(<><input aria-label="אחר" /><SearchField label="חיפוש" value="" onSearch={vi.fn()} /></>)
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getByRole('searchbox')).toHaveFocus()
    screen.getByRole('textbox', { name: 'אחר' }).focus()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'אחר' }), { key: '/' })
    expect(screen.getByRole('textbox', { name: 'אחר' })).toHaveFocus()
  })
})
