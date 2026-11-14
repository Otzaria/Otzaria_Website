// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const m = vi.hoisted(() => ({ pluginCount: vi.fn(), uploadCount: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/models/Message', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(0) } }))
vi.mock('@/models/Upload', () => ({ default: { countDocuments: m.uploadCount } }))
vi.mock('@/models/Plugin', () => ({ default: { countDocuments: m.pluginCount } }))

import { getAdminBadgeCounts } from './adminBadgeCounts'

describe('getAdminBadgeCounts — העלאות שלא נבדקו', () => {
  it('סופר לפי מצב הספר "לא נבדק" (כמו הסינון במסך), כולל מסמך בלי השדה — ולא לפי status הישן', async () => {
    m.uploadCount.mockResolvedValue(1848)
    m.pluginCount.mockResolvedValue(0)
    const counts = await getAdminBadgeCounts('admin_books')
    expect(counts.pendingUploads).toBe(1848)
    expect(m.uploadCount).toHaveBeenCalledWith(
      { isDeleted: false, bookStatus: { $in: [null, '', 'not_checked'] } },
      { maxTimeMS: expect.any(Number) }
    )
  })
})

describe('getAdminBadgeCounts — pending plugins', () => {
  it('counts the legacy approval queue only, without service plugins', async () => {
    m.pluginCount.mockResolvedValue(4)
    const counts = await getAdminBadgeCounts('admin_plugins')
    expect(counts.pendingPlugins).toBe(4)
    expect(m.pluginCount).toHaveBeenCalledWith({
      isHidden: false,
      hasService: { $ne: true },
      $or: [{ isApproved: false }, { pendingUpdate: { $ne: null } }],
    }, { maxTimeMS: expect.any(Number) })
  })
})
