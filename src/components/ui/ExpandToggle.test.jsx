// כפתור פתיחה של שורה: aria-expanded משקף את המצב, aria-controls מצביע על האזור, ariaLabel גובר על
// הטקסט הגלוי (למשל "91 עמודים" → "הצג את 91 העמודים"), ומקלדת (Enter/רווח) מפעילה.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import ExpandToggle from './ExpandToggle'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ExpandToggle label="91 עמודים" expanded={open} controls="pages-1" onToggle={() => setOpen((o) => !o)} />
      <div id="pages-1" hidden={!open}>תוכן</div>
    </>
  )
}

describe('ExpandToggle', () => {
  test('aria-expanded מתחלף בלחיצה, aria-controls מצביע על האזור', async () => {
    render(<Harness />)
    const button = screen.getByRole('button', { name: /91 עמודים/ })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'pages-1')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('תוכן')).toBeVisible()
  })

  test('Enter ורווח מפעילים', async () => {
    const onToggle = vi.fn()
    render(<ExpandToggle label="פרטים" expanded={false} onToggle={onToggle} />)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  test('ariaLabel גובר על הטקסט הגלוי', () => {
    render(<ExpandToggle label="3" ariaLabel="הצג 3 התנגשויות" expanded={false} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'הצג 3 התנגשויות' })).toBeInTheDocument()
  })
})
