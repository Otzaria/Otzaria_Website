import { describe, it, expect } from 'vitest'
import { pageClaimState, canFinishPage, claimStatusText } from './pageClaim'

describe('pageClaimState', () => {
  it('עמוד פנוי — available', () => {
    expect(pageClaimState({ status: 'available', claimedById: null }, 'u1')).toEqual({ state: 'available', holderName: null })
  })

  it('תפוס על ידי המשתמש (גם מזהה מספרי מול מחרוזת) — mine', () => {
    expect(pageClaimState({ status: 'in-progress', claimedById: 'u1', claimedBy: 'משה' }, 'u1').state).toBe('mine')
    expect(pageClaimState({ status: 'in-progress', claimedById: 7 }, '7').state).toBe('mine')
    expect(pageClaimState({ status: 'completed', claimedById: 'u1' }, 'u1').state).toBe('mine')
  })

  it('תפוס על ידי אחר — other, עם שם המחזיק', () => {
    expect(pageClaimState({ status: 'in-progress', claimedById: 'u2', claimedBy: ' דוד ' }, 'u1')).toEqual({ state: 'other', holderName: 'דוד' })
  })

  it('בלי משתמש מחובר — לעולם לא mine', () => {
    expect(pageClaimState({ status: 'in-progress', claimedById: '' }, '').state).toBe('other')
    expect(pageClaimState({ status: 'in-progress', claimedById: null }, undefined).state).toBe('other')
  })

  it('הושלם על ידי אחר — completed; בלי נתונים — unknown', () => {
    expect(pageClaimState({ status: 'completed', claimedById: 'u2' }, 'u1').state).toBe('completed')
    expect(pageClaimState(null, 'u1').state).toBe('unknown')
    expect(pageClaimState({}, 'u1').state).toBe('unknown')
  })
})

describe('canFinishPage / claimStatusText', () => {
  it('סיום — רק כשהעמוד של המשתמש', () => {
    expect(canFinishPage({ state: 'mine' })).toBe(true)
    for (const state of ['available', 'other', 'completed', 'unknown']) expect(canFinishPage({ state })).toBe(false)
    expect(canFinishPage(null)).toBe(false)
  })

  it('טקסט הסטטוס', () => {
    expect(claimStatusText({ state: 'other', holderName: 'דוד' })).toBe('בטיפול של דוד')
    expect(claimStatusText({ state: 'other', holderName: null })).toBe('תפוס ע״י מתנדב אחר')
    expect(claimStatusText({ state: 'completed', holderName: null })).toBe('העמוד הושלם')
    expect(claimStatusText({ state: 'mine', holderName: 'דוד' })).toBe('')
  })
})
