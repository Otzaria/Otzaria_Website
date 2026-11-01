import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Switch from './Switch'
import SegmentedControl from './SegmentedControl'
import Kbd from './Kbd'

describe('Switch', () => {
  it('role="switch" עם שם, תיאור ומצב; לחיצה הופכת', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="גלילה מתואמת" description="הצילום זז איתך" />)
    const sw = screen.getByRole('switch', { name: 'גלילה מתואמת' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveAccessibleDescription('הצילום זז איתך')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

function Segmented() {
  const [value, setValue] = useState('facing')
  return (
    <div dir="rtl">
      <SegmentedControl
        label="ריווח שורות"
        value={value}
        onChange={setValue}
        options={[{ value: 'facing', label: 'מול הסריקה' }, { value: 'fixed', label: 'קבוע' }]}
      />
    </div>
  )
}

describe('SegmentedControl', () => {
  it('radiogroup; רק הנבחר ב-Tab; חץ שמאלה (RTL) בוחר את הבא', () => {
    render(<Segmented />)
    expect(screen.getByRole('radiogroup', { name: 'ריווח שורות' })).toBeInTheDocument()
    const facing = screen.getByRole('radio', { name: 'מול הסריקה' })
    const fixed = screen.getByRole('radio', { name: 'קבוע' })
    expect(facing).toHaveAttribute('aria-checked', 'true')
    expect(fixed).toHaveAttribute('tabindex', '-1')
    facing.focus()
    fireEvent.keyDown(facing, { key: 'ArrowLeft' })
    expect(fixed).toHaveAttribute('aria-checked', 'true')
    expect(fixed).toHaveFocus()
    fireEvent.click(facing)
    expect(facing).toHaveAttribute('aria-checked', 'true')
  })
})

describe('Kbd', () => {
  it('מקש לכל שם, בכיוון LTR', () => {
    const { container } = render(<Kbd keys={['Ctrl', 'K']} />)
    const outer = container.querySelector('kbd')
    expect(outer).toHaveAttribute('dir', 'ltr')
    expect(outer.querySelectorAll('kbd')).toHaveLength(2)
  })

  it('בלי מקשים — כלום', () => {
    const { container } = render(<Kbd keys={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
