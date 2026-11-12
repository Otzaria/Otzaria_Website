// שגיאה באזור: מוכרזת (role=alert); בלי טקסט — כלום.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorNotice from './ErrorNotice'

describe('ErrorNotice', () => {
  test('עם טקסט — alert', () => {
    render(<ErrorNotice text="הטעינה נכשלה" />)
    expect(screen.getByRole('alert')).toHaveTextContent('הטעינה נכשלה')
  })

  test('בלי טקסט — כלום', () => {
    expect(render(<ErrorNotice text="" />).container).toBeEmptyDOMElement()
  })
})
