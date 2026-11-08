// סרגל הסינון המשותף: כפתור "סינון (n)" פותח את הבוררים; כשסגור ויש סינון — "מסונן: ..." ו"נקה"; "נקה סינון" שומר
// מקום כשאין סינון (נסתר, לא בטאב); בלי children — רק החיפוש ו-aside; disabled נועל את הניקוי.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterBar from './FilterBar'
import { FILTER_LAYOUTS, filterLayout, filterPanelClass } from './filterBarLayout'

const search = { label: 'חיפוש', placeholder: 'חפש', value: '', onSearch: () => {} }

describe('FilterBar', () => {
  test('כפתור "סינון (2)" פותח ומקפל את הלוח', async () => {
    render(
      <FilterBar panelId="p" search={search} count={2} summary={['א', 'ב']} active onClear={() => {}}>
        <span>בורר</span>
      </FilterBar>
    )
    const toggle = screen.getByRole('button', { name: 'סינון (2)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'p')
    expect(document.getElementById('p').className).toMatch(/(^| )hidden( |$)/)
    await userEvent.setup().click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('p').className).toMatch(/(^| )grid( |$)/)
  })

  test('סגור ויש סינון — "מסונן: ..." ו"נקה"; פתוח — השורה נעלמת', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(
      <FilterBar panelId="p" search={search} count={1} summary={['לא נבדק', 'משה']} active onClear={onClear}>
        <span>בורר</span>
      </FilterBar>
    )
    expect(screen.getByText('מסונן: לא נבדק, משה')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'נקה' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'סינון (1)' }))
    expect(screen.queryByText(/מסונן:/)).not.toBeInTheDocument()
  })

  test('בלי סינון — "סינון" בלי מספר, ו"נקה סינון" נסתר מקורא המסך ומהטאב', () => {
    render(<FilterBar panelId="p" search={search} onClear={() => {}}><span>בורר</span></FilterBar>)
    expect(screen.getByRole('button', { name: 'סינון' })).toBeInTheDocument()
    const clear = screen.getByText('נקה סינון').closest('button')
    expect(clear).toHaveAttribute('aria-hidden', 'true')
    expect(clear).toHaveAttribute('tabindex', '-1')
    expect(screen.queryByText(/מסונן:/)).not.toBeInTheDocument()
  })

  test('בלי children — רק החיפוש ו-aside, בלי כפתור "סינון"', () => {
    render(<FilterBar search={search} aside={<button type="button">רק חדשות</button>} />)
    expect(screen.getByRole('searchbox', { name: 'חיפוש' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'רק חדשות' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /סינון/ })).not.toBeInTheDocument()
  })

  test('בלי search — הכפתור והסיכום בשורה אחת; disabled נועל את "נקה"', async () => {
    const onClear = vi.fn()
    render(
      <FilterBar panelId="p" layout="pages" count={1} summary={['ספר']} active disabled onClear={onClear}>
        <span>בורר</span>
      </FilterBar>
    )
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    const clear = screen.getByRole('button', { name: 'נקה' })
    expect(clear).toHaveAttribute('aria-disabled', 'true')
    await userEvent.setup().click(clear)
    expect(onClear).not.toHaveBeenCalled()
  })
})

describe('filterBarLayout', () => {
  test('כל פריסה — מחרוזות מלאות לכל החלקים', () => {
    for (const layout of Object.values(FILTER_LAYOUTS)) {
      for (const key of ['compact', 'panel', 'clearHidden', 'columns']) expect(layout[key]).toMatch(/^@/)
    }
  })

  test('filterPanelClass — סגור: hidden; פתוח: grid; תמיד עם העמודות של הפריסה', () => {
    expect(filterPanelClass('fill3', false)).toContain('hidden')
    expect(filterPanelClass('fill3', true).split(' ')).toContain('grid')
    expect(filterPanelClass('pages', true)).toContain(FILTER_LAYOUTS.pages.columns)
  })

  test('פריסה לא מוכרת — שגיאה (ולא סרגל בלי עמודות)', () => {
    expect(() => filterLayout('fill9')).toThrow()
  })
})
