import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WikiMarkdown, { isAllowedImageSrc, isInternalHref } from './WikiMarkdown'

describe('isInternalHref', () => {
  it('נתיב באתר ועוגן — פנימיים', () => {
    expect(isInternalHref('/docs/search')).toBe(true)
    expect(isInternalHref('#intro')).toBe(true)
  })

  it('//host ו-/\host (protocol-relative) — חיצוניים', () => {
    expect(isInternalHref('//evil.example/login')).toBe(false)
    expect(isInternalHref('/\\evil.example')).toBe(false)
    expect(isInternalHref('https://example.com')).toBe(false)
  })
})

describe('SmartLink', () => {
  it('//host נפתח כקישור חיצוני (לשונית חדשה), לא כ-Link פנימי', () => {
    render(<WikiMarkdown markdown="[כניסה](//evil.example/login) ו-[חיפוש](/docs/search)" />)
    const external = screen.getByRole('link', { name: 'כניסה' })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'חיפוש' })).not.toHaveAttribute('target')
  })
})

describe('isAllowedImageSrc', () => {
  it('GitHub, האתר ונתיב יחסי — מותרים', () => {
    expect(isAllowedImageSrc('https://raw.githubusercontent.com/wiki/Otzaria/otzaria/a.png')).toBe(true)
    expect(isAllowedImageSrc('https://github.com/user-attachments/assets/x')).toBe(true)
    expect(isAllowedImageSrc('https://www.otzaria.org/logo.png')).toBe(true)
    expect(isAllowedImageSrc('/logo.png')).toBe(true)
    expect(isAllowedImageSrc('https://media.githubusercontent.com/media/a.png')).toBe(true)
  })

  it('מארח זר, http, //host ו-javascript — חסומים', () => {
    expect(isAllowedImageSrc('https://tracker.example/p.gif')).toBe(false)
    expect(isAllowedImageSrc('http://raw.githubusercontent.com/a.png')).toBe(false)
    expect(isAllowedImageSrc('//tracker.example/p.gif')).toBe(false)
    expect(isAllowedImageSrc('https://raw.githubusercontent.com.evil.example/a.png')).toBe(false)
    expect(isAllowedImageSrc('javascript:alert(1)')).toBe(false)
    expect(isAllowedImageSrc('data:image/png;base64,AAAA')).toBe(false)
    expect(isAllowedImageSrc('/api/auth/signout')).toBe(false)
    expect(isAllowedImageSrc('/API/x')).toBe(false)
    expect(isAllowedImageSrc('/docs/../api/x')).toBe(false)
    expect(isAllowedImageSrc('/%61pi/x')).toBe(false)
    expect(isAllowedImageSrc('')).toBe(false)
  })

  it('תמונה ממארח זר — לא נטענת, רק טקסט החלופה', () => {
    const { container } = render(<WikiMarkdown markdown="![פיקסל](https://tracker.example/p.gif)" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('פיקסל')
  })
})
