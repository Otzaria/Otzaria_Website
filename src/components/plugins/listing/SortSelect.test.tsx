import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SortSelect, { SORT_OPTIONS } from './SortSelect'
import { SORT_MODES } from '@/lib/pluginFilter'

describe('SortSelect', () => {
  it('התווית הגלויה מחוברת לשדה, והאפשרויות הן מצבי המיון של pluginFilter', () => {
    render(<SortSelect value="recommended" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'מיון' })).toHaveValue('recommended')
    expect(SORT_OPTIONS.map((o) => o.value)).toEqual(SORT_MODES)
  })

  it('בחירה מעבירה את הערך (לא את התווית)', async () => {
    const onChange = vi.fn()
    render(<SortSelect value="recommended" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'מיון' }), 'עודכנו לאחרונה')
    expect(onChange).toHaveBeenCalledWith('updated')
  })
})
