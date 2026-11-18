// @vitest-environment node
// רינדור השרת של GoldenBook — בלי window, כמו ב-SSR של Next. נבדק כאן ה-preload: הרצועה
// צריכה להתחיל לרדת מה-HTML עצמו (ולא רק אחרי ה-hydration), ורק למי שלא ביקש פחות תנועה.
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import GoldenBook from './GoldenBook'
import { CLOSED_SRC, OPEN_SRCSET, SPRITE_AVIF_SRC } from './goldenBookAssets'

const html = () => renderToString(
  <html>
    <body><GoldenBook /></body>
  </html>
)

const links = (markup: string) => markup.match(/<link[^>]*rel="preload"[^>]*>/g) ?? []
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1]

describe('GoldenBook — HTML מהשרת', () => {
  it('preload לרצועת ה-AVIF ב-<head>: type=image/avif, בעדיפות נמוכה ומסונן ב-media של reduced-motion', () => {
    const markup = html()
    const link = links(markup).find((l) => l.includes(`href="${SPRITE_AVIF_SRC}"`))
    expect(link).toBeDefined()
    expect(link).toContain('as="image"')
    expect(link).toContain('type="image/avif"')
    expect(link).toContain('media="(prefers-reduced-motion: no-preference)"')
    expect(link).toMatch(/fetchPriority="low"/i)
    expect(markup.indexOf(link!)).toBeLessThan(markup.indexOf('</head>'))
  })

  it('אין preload ל-WebP של הרצועה (דפדפן עם AVIF לא אמור להוריד אותו)', () => {
    expect(html()).not.toContain('golden-book-sprite.v2.webp')
  })

  it('preload לספר הפתוח (נחוץ בכל מסלול) — עם srcset/sizes, בלי media, בעדיפות נמוכה, ולפני הרצועה', () => {
    const markup = html()
    const link = links(markup).find((l) => attr(l, 'imageSrcSet') === OPEN_SRCSET)
    expect(link).toBeDefined()
    expect(link).not.toContain('media=')
    expect(link).toMatch(/fetchPriority="low"/i)
    expect(attr(link!, 'imageSizes')).toBeTruthy()
    expect(markup.indexOf(link!)).toBeLessThan(markup.indexOf(`href="${SPRITE_AVIF_SRC}"`))
  })

  it('התמונה ב-HTML היא הספר הסגור (LCP): בעדיפות גבוהה, עם srcset ומידות קבועות (בלי CLS)', () => {
    const img = html().match(/<img[^>]*>/)?.[0] ?? ''
    expect(attr(img, 'src')).toBe(CLOSED_SRC)
    expect(img).toMatch(/fetchPriority="high"/i)
    expect(attr(img, 'width')).toBe('560')
    expect(attr(img, 'height')).toBe('560')
    expect(attr(img, 'srcSet')).toMatch(/-320\.webp 320w, .*-560\.webp 560w$/)
    expect(attr(img, 'sizes')).toBeTruthy()
  })
})
