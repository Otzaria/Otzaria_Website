import { expect, it } from 'vitest'
import { pageImageUrl } from './api'

it('line crops preserve the canonical image version across builds', () => {
  const first = pageImageUrl('p1', 'scan', [0.1, 0.2, 0.3, 0.04], { baseUrl: '/api/tzurat-hadaf/pages/p1/image?side=scan&v=b1' })
  const second = pageImageUrl('p1', 'scan', [0.1, 0.2, 0.3, 0.04], { baseUrl: '/api/tzurat-hadaf/pages/p1/image?side=scan&v=b2' })
  expect(first).toContain('v=b1')
  expect(second).toContain('v=b2')
  expect(first).not.toBe(second)
  expect(first).toContain('x=0.1&y=0.2&w=0.3&h=0.04')
})
