import { describe, it, expect } from 'vitest'
import { adminActionsFor, defaultServiceTab, groupAdminReviews, needsException, quotaPause, rollbackReviewIds, serviceAttentionCount, SERVICE_TABS, type AdminReview } from './servicePluginsAdminLogic'

function review(overrides: Partial<AdminReview>): AdminReview {
  return {
    id: 'r1', pluginId: 'p1', pluginName: 'תוסף', kind: 'service', status: 'pending_admin', pluginVersion: '1.0.0',
    serviceVersion: '1.0.0', ownerName: 'מפתח', createdAt: '2026-10-01T00:00:00Z', selectedAt: null, attempts: 0,
    nextAttemptAt: null, lastError: null, decision: null, cooldown: { blocked: false, nextAllowedAt: null },
    adminException: false, canRollback: false, ...overrides
  }
}

describe('servicePluginsAdminLogic', () => {
  it('קיבוץ: ממתינים, תקלות תפעוליות בנפרד, בבדיקה, טיוטות והסתיימו', () => {
    const groups = groupAdminReviews([
      review({ id: 'a', status: 'pending_admin' }),
      review({ id: 'b', status: 'needs_operator' }),
      review({ id: 'c', status: 'running' }),
      review({ id: 'd', status: 'waiting_quota' }),
      review({ id: 'e', status: 'draft' }),
      review({ id: 'f', status: 'rejected' })
    ])
    expect(groups.pending.map((r) => r.id)).toEqual(['a'])
    expect(groups.operator.map((r) => r.id)).toEqual(['b'])
    expect(groups.inProgress.map((r) => r.id)).toEqual(['c', 'd'])
    expect(groups.notSubmitted.map((r) => r.id)).toEqual(['e'])
    expect(groups.finished.map((r) => r.id)).toEqual(['f'])
  })

  it('ממתין לבחירה: "התחל", ובחסימת 21 יום בלי חריגה — חריגת חירום במקום', () => {
    expect(adminActionsFor(review({}))).toEqual(['start', 'cancel'])
    const blocked = review({ cooldown: { blocked: true, nextAllowedAt: '2026-11-01T00:00:00Z' } })
    expect(needsException(blocked)).toBe(true)
    expect(adminActionsFor(blocked)).toEqual(['emergency', 'cancel'])
    expect(adminActionsFor({ ...blocked, adminException: true })).toEqual(['start', 'cancel'])
    // עדכון תוסף בלבד פטור מ-21 יום
    expect(adminActionsFor({ ...blocked, kind: 'plugin' })).toEqual(['start', 'cancel'])
  })

  it('תקלה תפעולית: ניסיון חוזר; הגשה שהסתיימה — בלי ביטול', () => {
    expect(adminActionsFor(review({ status: 'needs_operator' }))).toEqual(['retry', 'cancel'])
    expect(adminActionsFor(review({ status: 'running' }))).toEqual(['cancel'])
    expect(adminActionsFor(review({ status: 'rejected' }))).toEqual([])
  })

  it('חזרה לאחור — פעם אחת לכל תוסף, על המאושרת האחרונה', () => {
    const reviews = [
      review({ id: 'new', status: 'approved', canRollback: true }),
      review({ id: 'old', status: 'approved', canRollback: true }),
      review({ id: 'other', pluginId: 'p2', status: 'approved', canRollback: false })
    ]
    const ids = rollbackReviewIds(reviews)
    expect([...ids]).toEqual(['new'])
    expect(adminActionsFor(reviews[0], ids)).toEqual(['rollback'])
    expect(adminActionsFor(reviews[1], ids)).toEqual([])
  })

  it('quotaPause — רק מועד עתידי', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    expect(quotaPause({ quotaPausedUntil: '2026-10-24T18:00:00Z', lock: null }, now)).toBe('2026-10-24T18:00:00Z')
    expect(quotaPause({ quotaPausedUntil: '2026-10-24T06:00:00Z', lock: null }, now)).toBeNull()
    expect(quotaPause({ quotaPausedUntil: null, lock: null }, now)).toBeNull()
    expect(quotaPause(null, now)).toBeNull()
  })
})

describe('לשוניות תוספי השירות', () => {
  const r = (status: string) => ({ id: status, pluginId: 'p', pluginName: 'x', kind: 'plugin', status } as unknown as AdminReview)
  it('חמש לשוניות בסדר; תקלה אצלנו — "נעצר בתקלה", לא "נכשל" (שנשמע כמו דחייה)', () => {
    expect(SERVICE_TABS.map((t) => t.label)).toEqual(['ממתין לאישור', 'נעצר בתקלה', 'בבדיקה', 'טיוטה', 'סגור'])
  })
  it('מונה: ממתינות לבחירה ותקועות בתקלה', () => {
    expect(serviceAttentionCount([r('pending_admin'), r('needs_operator'), r('running'), r('approved')])).toBe(2)
    expect(serviceAttentionCount(null)).toBe(0)
  })
  it('הלשונית הראשונה שיש בה משהו', () => {
    expect(defaultServiceTab(groupAdminReviews([r('running')]))).toBe('inProgress')
    expect(defaultServiceTab(groupAdminReviews([r('needs_operator'), r('pending_admin')]))).toBe('pending')
    expect(defaultServiceTab(groupAdminReviews([]))).toBe('pending')
  })
})
