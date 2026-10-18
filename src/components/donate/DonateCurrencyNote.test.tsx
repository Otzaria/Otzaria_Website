import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import DonateCurrencyNote from './DonateCurrencyNote'

it('מציג את הערת המטבע כהערה בתפקיד אזהרה, בלי לשנות את הנוסח', () => {
  render(<DonateCurrencyNote className="mb-6" />)
  const note = screen.getByRole('note')
  expect(note.textContent).toContain('שים לב: עדיף לתרום בשקלים. עמלת ההמרה ממטבע חוץ (למשל דולרים) בשירות זה גבוהה.')
  expect(note.className).toContain('bg-warning-container')
  expect(note.className).toContain('mb-6')
  expect(note.querySelector('[aria-hidden="true"]')).not.toBeNull()
})
