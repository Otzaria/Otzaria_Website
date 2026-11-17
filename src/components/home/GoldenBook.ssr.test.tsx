// @vitest-environment node
// רינדור השרת של GoldenBook — בלי window, כמו ב-SSR של Next.
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import GoldenBook from './GoldenBook'
import { CLOSED_SRC, OPEN_SRCSET, SPRITE_AVIF_SRC, SPRITE_WEBP_SRC } from './goldenBookAssets'

const html = () => renderToString(
  <html>
    <body><GoldenBook /></body>
  </html>
)

const links = (markup: string) => markup.match(/<link[^>]*rel="preload"[^>]*>/g) ?? []
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1]

describe('GoldenBook — HTML מהשרת', () => {
  it('הרצועה לא מופיעה ב-HTML הראשוני בשום פורמט', () => {
    const markup = html()
    expect(markup).not.toContain(SPRITE_AVIF_SRC)
    expect(markup).not.toContain(SPRITE_WEBP_SRC)
  })

  it('preload לספר הפתוח (נחוץ בכל מסלול) — עם srcset/sizes ובעדיפות נמוכה', () => {
    const markup = html()
    const link = links(markup).find((l) => attr(l, 'imageSrcSet') === OPEN_SRCSET)
    expect(link).toBeDefined()
    expect(link).not.toContain('media=')
    expect(link).toMatch(/fetchPriority="low"/i)
    expect(attr(link!, 'imageSizes')).toBeTruthy()
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
