// שגיאת פעולה: alert עם הטקסט; התחברות שפגה — קישור "התחבר"; בלי שגיאה — כלום.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import ActionError from './ActionError'

describe('ActionError', () => {
  test('שגיאה רגילה — alert בלי קישור', () => {
    render(<ActionError error={{ text: 'השמירה נכשלה' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('השמירה נכשלה')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('התחברות שפגה — קישור "התחבר" לדף ההתחברות', () => {
    render(<ActionError error={{ text: 'פג תוקף ההתחברות', sessionExpired: true }} />)
    expect(screen.getByRole('link', { name: 'התחבר' }).getAttribute('href')).toMatch(/login/)
  })

  test('בלי שגיאה — כלום', () => {
    expect(render(<ActionError error={null} />).container).toBeEmptyDOMElement()
  })
})
