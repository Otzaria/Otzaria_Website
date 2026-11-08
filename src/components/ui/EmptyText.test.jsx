// "אין מה להציג": פסקה עם הטקסט.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyText from './EmptyText'

describe('EmptyText', () => {
  test('מציג את הטקסט בפסקה', () => {
    render(<EmptyText>אין דיווחים</EmptyText>)
    expect(screen.getByText('אין דיווחים').tagName).toBe('P')
  })
})
