// שלד רשימה: מוכרז בשם (role=status), במספר השורות שביקשו.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import ListLoading from './ListLoading'

describe('ListLoading', () => {
  test('ברירת מחדל — "טוען…", שלוש שורות', () => {
    render(<ListLoading />)
    expect(screen.getByRole('status', { name: 'טוען…' }).children).toHaveLength(3)
  })

  test('rows ו-label', () => {
    render(<ListLoading rows={5} label="טוען דיווחים…" />)
    expect(screen.getByRole('status', { name: 'טוען דיווחים…' }).children).toHaveLength(5)
  })
})
