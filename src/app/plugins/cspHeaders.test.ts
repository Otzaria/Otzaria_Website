import { describe, it, expect } from 'vitest'
import nextConfig from '../../../next.config'

type HeaderRule = { source: string; headers: { key: string; value: string }[] }

const csp = (rule: HeaderRule | undefined) => rule?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
const directive = (policy: string, name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

describe('CSP — גישה ל-loopback רק בחנות התוספים', () => {
  it('הכלל הכללי אינו מתיר 127.0.0.1 / localhost', async () => {
    const rules = (await nextConfig.headers()) as HeaderRule[]
    const global = csp(rules.find((r) => r.source === '/:path*'))
    expect(directive(global, 'connect-src')).not.toMatch(/127\.0\.0\.1|localhost/)
  })

  it('/plugins/:path* — CSP אחד שדורס את הכללי (מאוחר ממנו), זהה לו פרט ל-connect-src', async () => {
    const rules = (await nextConfig.headers()) as HeaderRule[]
    const globalIndex = rules.findIndex((r) => r.source === '/:path*')
    const pluginRules = rules.filter((r) => r.source.startsWith('/plugins') && csp(r))
    expect(pluginRules).toHaveLength(1)
    const pluginIndex = rules.indexOf(pluginRules[0])
    expect(pluginIndex).toBeGreaterThan(globalIndex)
    expect(pluginRules[0].headers.filter((h) => h.key === 'Content-Security-Policy')).toHaveLength(1)

    const global = csp(rules[globalIndex])
    const plugins = csp(pluginRules[0])
    expect(directive(plugins, 'connect-src')).toBe(`${directive(global, 'connect-src')} http://127.0.0.1:* http://localhost:*`)
    const others = (policy: string) => policy.split('; ').filter((d) => !d.startsWith('connect-src '))
    expect(others(plugins)).toEqual(others(global))
  })
})
