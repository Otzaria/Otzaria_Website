// @vitest-environment node
// רינדור השרת של GoldenBook — בלי window, כמו ב-SSR של Next. נבדק כאן ה-preload: הרצועה
// צריכה להתחיל לרדת מה-HTML עצמו (ולא רק אחרי ה-hydration), ורק למי שלא ביקש פחות תנועה.
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import GoldenBook from './GoldenBook'

const html = () => renderToString(
  <html>
    <body><GoldenBook /></body>
  </html>
)

const preloadOf = (markup: string, href: string) =>
  markup.match(new RegExp(`<link[^>]*rel="preload"[^>]*href="${href}"[^>]*>`))?.[0]

describe('GoldenBook — HTML מהשרת', () => {
  it('preload לרצועה ב-<head>, בעדיפות נמוכה ומסונן ב-media של reduced-motion', () => {
    const markup = html()
    const link = preloadOf(markup, '/home/golden-book-sprite.webp')
    expect(link).toBeDefined()
    expect(link).toContain('as="image"')
    expect(link).toContain('media="(prefers-reduced-motion: no-preference)"')
    expect(link).toMatch(/fetchPriority="low"/i)
    expect(markup.indexOf(link!)).toBeLessThan(markup.indexOf('</head>'))
  })

  it('preload לספר הפתוח (נחוץ בכל מסלול) — בלי media, בעדיפות נמוכה, ולפני הרצועה', () => {
    const markup = html()
    const link = preloadOf(markup, '/home/golden-book.webp')
    expect(link).toBeDefined()
    expect(link).not.toContain('media=')
    expect(link).toMatch(/fetchPriority="low"/i)
    expect(markup.indexOf(link!)).toBeLessThan(markup.indexOf('golden-book-sprite'))
  })

  it('התמונה ב-HTML היא הספר הסגור (LCP), בעדיפות גבוהה', () => {
    expect(html()).toMatch(/<img[^>]*src="\/home\/golden-book-closed\.webp"[^>]*fetchPriority="high"/i)
  })
})
