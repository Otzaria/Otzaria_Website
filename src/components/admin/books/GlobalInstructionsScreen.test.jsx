// הנחיות כלליות: שינוי שלא נשמר — "לצאת בלי לשמור?" גם בקישור מחוץ למסך (הסרגל), לא רק בלשוניות.
import { describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))

import GlobalInstructionsScreen from './GlobalInstructionsScreen'

vi.setConfig({ testTimeout: 20000 })

describe('GlobalInstructionsScreen', () => {
  test('קישור בסרגל עם שינוי שלא נשמר: "הישאר" נשאר, "צא" עובר', async () => {
    const user = userEvent.setup()
    const reached = []
    const onClick = (event) => {
      const link = event.target.closest('a')
      if (!link) return
      event.preventDefault()
      reached.push(link.getAttribute('href'))
    }
    document.addEventListener('click', onClick)
    const sidebar = document.createElement('a')
    sidebar.href = '/library/admin/users'
    sidebar.textContent = 'משתמשים'
    document.body.append(sidebar)

    render(<ToastProvider><GlobalInstructionsScreen initialInstructions={{ sections: [{ title: 'כללי', items: ['שורה'] }] }} /></ToastProvider>)
    await user.type(screen.getByLabelText(/^ההנחיות/), ' נוספת')
    await user.click(sidebar)
    await user.click(within(screen.getByRole('dialog', { name: 'לצאת בלי לשמור?' })).getByRole('button', { name: 'הישאר' }))
    expect(reached).toEqual([])
    await user.click(sidebar)
    await user.click(within(screen.getByRole('dialog', { name: 'לצאת בלי לשמור?' })).getByRole('button', { name: 'צא בלי לשמור' }))
    await waitFor(() => expect(reached).toEqual(['/library/admin/users']))

    sidebar.remove()
    document.removeEventListener('click', onClick)
  })

  test('שאלות הבסיס בסיום עמוד: מוצגות, ונשמרות יחד עם ההנחיות (שורה = שאלה, בלי שורות ריקות)', async () => {
    const user = userEvent.setup()
    const sent = []
    global.fetch = vi.fn(async (url, options = {}) => {
      sent.push({ url, body: options.body ? JSON.parse(options.body) : null })
      return { ok: true, status: 200, type: 'basic', redirected: false, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ success: true }) }
    })
    render(
      <ToastProvider>
        <GlobalInstructionsScreen
          initialInstructions={{ sections: [{ title: 'כללי', items: ['שורה'] }] }}
          initialFinishQuestions={{ items: ['בדקתי ראשי תיבות'] }}
        />
      </ToastProvider>
    )
    const area = screen.getByLabelText(/^שאלות הבסיס/)
    expect(area).toHaveValue('בדקתי ראשי תיבות')
    expect(screen.getByRole('button', { name: 'שמור' })).toBeDisabled()
    await user.type(area, '{Enter}{Enter}עברתי על הכותרות')
    await user.click(screen.getByRole('button', { name: 'שמור' }))
    await screen.findByText('ההנחיות הכלליות נשמרו')
    expect(sent).toEqual([{
      url: '/api/admin/books/global-instructions',
      body: {
        instructions: { sections: [{ title: 'כללי', items: ['שורה'] }] },
        finishQuestions: { items: ['בדקתי ראשי תיבות', 'עברתי על הכותרות'] },
      },
    }])
    expect(screen.getByRole('button', { name: 'שמור' })).toBeDisabled()
  })
})
