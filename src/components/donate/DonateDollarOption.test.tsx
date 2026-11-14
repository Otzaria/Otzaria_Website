import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import DonateDollarOption, { NEDAVOS_DOLLAR_URL } from './DonateDollarOption'

it('מציג את אפשרות התרומה בדולרים כקישור חיצוני לנדבות, בלשונית חדשה', () => {
  render(<DonateDollarOption className="mb-6" />)
  expect(NEDAVOS_DOLLAR_URL).toBe('https://nedavos.org/8526')
  expect(screen.getByText('תרומה בדולרים')).toBeTruthy()
  expect(screen.getByText('אפשר לתרום גם בדולרים, באמצעות אתר נדבות.')).toBeTruthy()

  const link = screen.getByRole('link', { name: /לתרומה בדולרים/ })
  expect(link.getAttribute('href')).toBe('https://nedavos.org/8526')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  expect(link.closest('.mb-6')).not.toBeNull()
})
