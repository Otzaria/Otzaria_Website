import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssignCategoriesModal from './AssignCategoriesModal'

const plugin = { _id: 'p1', name: 'תוסף לדוגמה' }
const categories = [
  { id: 'c1', name: 'כלי לימוד', icon: 'menu_book', isVisible: true },
  { id: 'c2', name: 'קטגוריה מוסתרת', icon: '', isVisible: false }
]

describe('AssignCategoriesModal', () => {
  it('renders the plugin name and all categories with their checked state', () => {
    render(
      <AssignCategoriesModal
        plugin={plugin}
        categories={categories}
        assignedCategoryIds={['c1']}
        processingCategoryId={null}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(`שיבוץ בקטגוריות: ${plugin.name}`)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /כלי לימוד/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /קטגוריה מוסתרת/ })).not.toBeChecked()
    expect(screen.getByText('מוסתרת')).toBeInTheDocument()
  })

  it('shows a message instead of a list when there are no categories', () => {
    render(
      <AssignCategoriesModal
        plugin={plugin}
        categories={[]}
        assignedCategoryIds={[]}
        processingCategoryId={null}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/עדיין לא נוצרו קטגוריות/)).toBeInTheDocument()
  })

  it('calls onToggle with the plugin, category and new checked value when a checkbox is toggled', async () => {
    const onToggle = vi.fn()
    render(
      <AssignCategoriesModal
        plugin={plugin}
        categories={categories}
        assignedCategoryIds={['c1']}
        processingCategoryId={null}
        onToggle={onToggle}
        onClose={vi.fn()}
      />
    )

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /קטגוריה מוסתרת/ }))
    expect(onToggle).toHaveBeenCalledWith(plugin, categories[1], true)

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /כלי לימוד/ }))
    expect(onToggle).toHaveBeenCalledWith(plugin, categories[0], false)
  })

  it('disables all checkboxes while a category is processing', () => {
    render(
      <AssignCategoriesModal
        plugin={plugin}
        categories={categories}
        assignedCategoryIds={['c1']}
        processingCategoryId="c1"
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: /כלי לימוד/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /קטגוריה מוסתרת/ })).toBeDisabled()
  })

  it('calls onClose from the footer button and from the backdrop', async () => {
    const onClose = vi.fn()
    render(
      <AssignCategoriesModal
        plugin={plugin}
        categories={categories}
        assignedCategoryIds={[]}
        processingCategoryId={null}
        onToggle={vi.fn()}
        onClose={onClose}
      />
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'סגור' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
