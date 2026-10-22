// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { formatPluginForPublic } from './pluginSubmission'
import { formatVersionForPublic } from './pluginVersions'

const LIVE_SHA = 'a'.repeat(64)
const OLD_SHA = 'b'.repeat(64)

function plugin(overrides = {}) {
  return {
    _id: { toString: () => '0123456789abcdef01234567' },
    name: 'בדיקה',
    slug: 'test',
    version: '2.0.0',
    status: 'stable',
    compatibleWith: '0.9.96',
    pluginFileName: 'p.otzplugin',
    pluginFileExt: '.otzplugin',
    pluginFileSize: 10,
    pluginFileSha256: LIVE_SHA,
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    versions: [
      { version: '1.0.0', pluginFileExt: '.otzplugin', pluginFileSha256: OLD_SHA },
      { version: '0.9.0', pluginFileExt: '.otzplugin' }
    ],
    ...overrides
  }
}

describe('sha256 in the public plugin API', () => {
  it('exposes the live build hash at the top level and per entry in versions[]', () => {
    const pub = formatPluginForPublic(plugin())
    expect(pub.sha256).toBe(LIVE_SHA)
    expect(pub.versions.map((v) => [v.version, v.sha256])).toEqual([
      ['2.0.0', LIVE_SHA],
      ['1.0.0', OLD_SHA],
      ['0.9.0', null]
    ])
  })

  it('is null for a legacy live file without a hash', () => {
    expect(formatPluginForPublic(plugin({ pluginFileSha256: undefined })).sha256).toBeNull()
  })

  it('a historical version page carries that version hash, not the live one', () => {
    const p = plugin()
    const live = formatPluginForPublic(p)
    expect(formatVersionForPublic(live, p, p.versions[0]).sha256).toBe(OLD_SHA)
    expect(formatVersionForPublic(live, p, p.versions[1]).sha256).toBeNull()
  })
})

describe('publishedAt in the public plugin API', () => {
  it('is createdAt for a plugin uploaded to the site', () => {
    const pub = formatPluginForPublic(plugin({ createdAt: new Date('2026-07-01T10:00:00Z') }))
    expect(pub.publishedAt).toBe('2026-07-01T10:00:00.000Z')
  })

  it('a plugin migrated from the old store keeps its earlier original date', () => {
    const pub = formatPluginForPublic(plugin({ createdAt: new Date('2026-04-30T19:47:00Z'), originalDate: '2025-11-02' }))
    expect(pub.publishedAt).toBe('2025-11-02T00:00:00.000Z')
  })

  it('is null without any known date', () => {
    expect(formatPluginForPublic(plugin({ originalDate: 'garbage' })).publishedAt).toBeNull()
  })
})
