import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import BookAliasesCard from './BookAliasesCard'

const props = (aliases) => ({
  book: { title: 'תוספתא נדרים', aliases }, basket: [], pending: [], titlesByKey: new Map(),
  onOp: vi.fn(), onError: vi.fn(), onConflict: vi.fn(),
})

test('ordinary punctuation duplicates show the existing spelling', () => {
  const p = props(['רמבם הלכות שבת'])
  render(<BookAliasesCard {...p} />)
  fireEvent.change(screen.getByPlaceholderText('כינוי או ר״ת חדש'), { target: { value: 'רמב״ם, הלכות שבת' } })
  fireEvent.click(screen.getByText('לסל'))
  expect(p.onOp).not.toHaveBeenCalled()
  expect(p.onError).toHaveBeenCalledWith(expect.stringContaining('ערכו את "רמבם הלכות שבת"'))
})

test('a distinct amud alias can be added', () => {
  const p = props(['תוס\' נדרים', 'תוס. נדרים'])
  render(<BookAliasesCard {...p} />)
  fireEvent.change(screen.getByPlaceholderText('כינוי או ר״ת חדש'), { target: { value: 'תוס: נדרים' } })
  fireEvent.click(screen.getByText('לסל'))
  expect(p.onError).not.toHaveBeenCalled()
  expect(p.onOp).toHaveBeenCalledWith({ type: 'add', book: 'תוספתא נדרים', alias: 'תוס: נדרים' })
})

test('an amud alias can be edited without colliding with an apostrophe alias', () => {
  const p = props(['תוס\' נדרים', 'תוס. נדרים'])
  render(<BookAliasesCard {...p} />)
  fireEvent.click(screen.getAllByLabelText('עריכה')[1])
  fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'תוס. נדרים!' } })
  fireEvent.click(screen.getByText('עדכון'))
  expect(p.onError).not.toHaveBeenCalled()
  expect(p.onOp).toHaveBeenCalledWith({ type: 'rename', book: 'תוספתא נדרים', from: 'תוס. נדרים', to: 'תוס. נדרים!' })
})

test('a spelling without quotes can still be edited to include them', () => {
  const p = props(['רמבם הלכות שבת'])
  render(<BookAliasesCard {...p} />)
  fireEvent.click(screen.getByLabelText('עריכה'))
  fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'רמב״ם הלכות שבת' } })
  fireEvent.click(screen.getByText('עדכון'))
  expect(p.onError).not.toHaveBeenCalled()
  expect(p.onOp).toHaveBeenCalledWith({ type: 'rename', book: 'תוספתא נדרים', from: 'רמבם הלכות שבת', to: 'רמב״ם הלכות שבת' })
})
