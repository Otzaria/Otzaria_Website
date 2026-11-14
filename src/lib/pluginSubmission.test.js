// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { formatPluginForPublic } from './pluginSubmission'

const base = {
  _id: { toString: () => '0123456789abcdef01234567' },
  name: 'בדיקה',
  slug: 'test',
  version: '2.0.0',
  status: 'stable',
  compatibleWith: '0.9.96',
  pluginFileExt: '.otzplugin',
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  versions: []
}

describe('formatPluginForPublic hasService', () => {
  it('is false for regular plugins and true only for service plugins', () => {
    expect(formatPluginForPublic(base).hasService).toBe(false)
    expect(formatPluginForPublic({ ...base, hasService: true }).hasService).toBe(true)
    expect(formatPluginForPublic({ ...base, hasService: 'true' }).hasService).toBe(false)
  })
})
