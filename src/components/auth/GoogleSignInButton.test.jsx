import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const getProviders = vi.fn()
const signIn = vi.fn()
vi.mock('next-auth/react', () => ({ getProviders: () => getProviders(), signIn: (...args) => signIn(...args) }))

// הרכיב שומר את תשובת getProviders במטמון ברמת המודול — טוענים מחדש בכל טסט.
async function loadButton() {
  vi.resetModules()
  return (await import('./GoogleSignInButton')).default
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    getProviders.mockReset()
    signIn.mockReset()
  })

  it('לא מרנדר כלום (גם לא מפריד) כש-Google לא מוגדר בשרת', async () => {
    getProviders.mockResolvedValue({ credentials: {} })
    const Button = await loadButton()
    const { container } = render(<Button withDivider callbackUrl="/x" />)
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it('מציג כפתור ומפריד כש-Google מוגדר, ושולח login_hint', async () => {
    getProviders.mockResolvedValue({ credentials: {}, google: {} })
    const Button = await loadButton()
    render(<Button withDivider callbackUrl="/library/dashboard" loginHint="a@x.com" label="אימות מיידי עם Google" />)

    const btn = await screen.findByRole('button', { name: 'אימות מיידי עם Google' })
    expect(screen.getByText('או')).toBeInTheDocument()

    await userEvent.click(btn)
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/library/dashboard' }, { login_hint: 'a@x.com' })
    expect(btn).toBeDisabled()
  })
})
