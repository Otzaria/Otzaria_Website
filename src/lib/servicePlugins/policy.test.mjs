import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseVersion, compareVersions, isValidRange, versionInRange, isValidRepository, isValidCommit, parseReleaseUrl,
  validateDraftRequest, canonicalJson, submissionDigest, canTransition, nextAfterTransientFailure, nextAfterQuota,
  cooldownState, validateDecision, missingReceipts, ACTIVE_STATUSES, STATUSES, ASSET_KEYS, LIMITS, REQUIRED_RECEIPTS,
  QUOTA_UNKNOWN_WAIT_MS, QUOTA_RESET_GRACE_MS,
} from './policy.js'

const COMMIT = '0123456789012345678901234567890123456789'
const asset = (extra = {}) => ({
  name: 'setup.exe', size: 12345678, os: 'windows', arch: 'x64', minOs: 'Windows 10', port: 18090,
  bundledPluginPath: 'plugin.otzplugin', releaseUrl: 'https://github.com/OWNER/REPO/releases/download/v1.0.0/setup.exe', ...extra,
})
const serviceBody = (extra = {}) => ({
  kind: 'service', pluginVersion: '1.0.0', pluginSize: 12345, serviceVersion: '1.0.0', serviceRange: { min: '1.0.0', max: '1.9.99' },
  sources: [{ repository: 'OWNER/REPO', commit: COMMIT }], changeNotes: 'הגשה ראשונה', uninstall: 'הסרה דרך אפליקציות מותקנות',
  virusTotalConsent: false, assets: [asset()], ...extra,
})
const pluginBody = (extra = {}) => ({
  kind: 'plugin', pluginVersion: '1.1.0', pluginSize: 100, serviceRange: { min: '1.0.0', max: null },
  sources: [{ repository: 'OWNER/REPO', commit: COMMIT }], ...extra,
})
const errorsOf = (body, ctx) => {
  const r = validateDraftRequest(body, ctx)
  assert.equal(r.ok, false, 'expected validation failure')
  return r.errors.join('\n')
}

test('parseVersion: X.Y.Z בלבד, בלי אפסים מובילים, עד 999999', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3])
  assert.deepEqual(parseVersion('0.0.0'), [0, 0, 0])
  assert.deepEqual(parseVersion('999999.0.1'), [999999, 0, 1])
  for (const bad of ['1.2', '1.2.3.4', '01.2.3', '1.02.3', '1000000.0.0', 'v1.2.3', '1.2.3-beta', '1.2.3+b', ' 1.2.3', '', null, 1, '1..3']) {
    assert.equal(parseVersion(bad), null, String(bad))
  }
})

test('compareVersions מספרי (לא לקסיקוגרפי)', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('0.9.9', '1.0.0'), -1)
  assert.throws(() => compareVersions('1.0', '1.0.0'))
})

test('טווחים: מינימום חובה, מקסימום null = ללא תקרה', () => {
  assert.ok(isValidRange({ min: '1.0.0', max: null }))
  assert.ok(isValidRange({ min: '1.0.0' }))
  assert.ok(isValidRange({ min: '1.0.0', max: '1.0.0' }))
  assert.ok(!isValidRange({ min: '2.0.0', max: '1.0.0' }))
  assert.ok(!isValidRange({ max: '1.0.0' }))
  assert.ok(!isValidRange(null))
  assert.ok(versionInRange('5.0.0', { min: '1.0.0', max: null }))
  assert.ok(versionInRange('1.9.99', { min: '1.0.0', max: '1.9.99' }))
  assert.ok(!versionInRange('1.9.100', { min: '1.0.0', max: '1.9.99' }))
  assert.ok(!versionInRange('0.9.0', { min: '1.0.0', max: null }))
  assert.ok(!versionInRange(null, { min: '1.0.0', max: null }))
})

test('מאגר ו-commit', () => {
  assert.ok(isValidRepository('Otzaria/otzaria-library'))
  assert.ok(isValidRepository('a/b.c_d-e'))
  for (const bad of ['owner', 'a/b/c', '-a/b', 'a/..', 'a/.', 'a b/c', '/b', 'a/', 'o'.repeat(40) + '/r']) {
    assert.ok(!isValidRepository(bad), bad)
  }
  assert.ok(isValidCommit(COMMIT))
  assert.ok(!isValidCommit(COMMIT.toUpperCase().replace(/0/g, 'A')))
  assert.ok(!isValidCommit(COMMIT.slice(1)))
})

test('parseReleaseUrl: רק קובץ Release ב-github.com ב-https', () => {
  assert.deepEqual(parseReleaseUrl('https://github.com/o/r/releases/download/v1.0.0/setup.exe'), { owner: 'o', repo: 'r', tag: 'v1.0.0', name: 'setup.exe' })
  assert.equal(parseReleaseUrl('https://github.com/o/r/releases/download/v%201/a%20b.exe').name, 'a b.exe')
  for (const bad of [
    'http://github.com/o/r/releases/download/v1/a.exe',
    'https://evil.com/o/r/releases/download/v1/a.exe',
    'https://github.com.evil.com/o/r/releases/download/v1/a.exe',
    'https://github.com:444/o/r/releases/download/v1/a.exe',
    'https://user@github.com/o/r/releases/download/v1/a.exe',
    'https://github.com/o/r/releases/tag/v1',
    'https://github.com/o/r/releases/download/v1/a.exe?x=1',
    'https://github.com/o/r/releases/download/v1/sub/a.exe',
    'https://github.com/o/r/releases/download/v1/%2e%2e',
    'https://github.com/o/r/releases/download/v1/a%2Fb.exe',
    'https://objects.githubusercontent.com/o/r/releases/download/v1/a.exe',
    'not a url',
  ]) assert.equal(parseReleaseUrl(bad), null, bad)
})

test('validateDraftRequest: דוגמת המדריך עוברת ומנורמלת', () => {
  const r = validateDraftRequest(serviceBody(), {})
  assert.equal(r.ok, true, r.errors?.join('\n'))
  assert.equal(r.value.assets[0].key, 'native0')
  assert.equal(r.value.serviceVersion, '1.0.0')
  assert.deepEqual(r.value.serviceRange, { min: '1.0.0', max: '1.9.99' })
  assert.equal(r.value.uninstall, 'הסרה דרך אפליקציות מותקנות')
})

test('validateDraftRequest: גרסאות שפורסמו/נמוכות נדחות', () => {
  const ctx = { currentPluginVersion: '1.0.0', currentServiceVersion: '1.0.0', publishedPluginVersions: ['1.0.0', '1.1.0'], publishedServiceVersions: ['1.0.0', '1.1.0'] }
  assert.match(errorsOf(serviceBody({ pluginVersion: '1.1.0', serviceVersion: '1.2.0' }), ctx), /כבר פורסמה/)
  assert.match(errorsOf(serviceBody({ pluginVersion: '0.9.0', serviceVersion: '1.2.0' }), ctx), /גבוהה מהגרסה הנוכחית/)
  assert.match(errorsOf(serviceBody({ pluginVersion: '1.2.0', serviceVersion: '1.1.0' }), ctx), /גרסת השירות 1\.1\.0 כבר פורסמה/)
  assert.ok(validateDraftRequest(serviceBody({ pluginVersion: '1.2.0', serviceVersion: '1.2.0' }), ctx).ok)
})

test('validateDraftRequest: שירות מחוץ לטווח שהוצהר', () => {
  assert.match(errorsOf(serviceBody({ serviceVersion: '2.0.0' }), {}), /בתוך טווח התאימות/)
})

test('validateDraftRequest: מתקינים — סיומת, גודל, פורט, כפילות, Release ממאגר המקור', () => {
  assert.match(errorsOf(serviceBody({ assets: [asset({ name: 'setup.dmg' })] })), /סיומת/)
  assert.match(errorsOf(serviceBody({ assets: [asset({ os: 'android', arch: 'universal', name: 'a.exe' })] })), /סיומת/)
  assert.ok(validateDraftRequest(serviceBody({ assets: [asset({ os: 'linux', name: 'App.AppImage' })] })).ok)
  assert.match(errorsOf(serviceBody({ assets: [asset({ size: LIMITS.installerBytes + 1 })] })), /הגודל/)
  assert.match(errorsOf(serviceBody({ assets: [asset({ size: 1.5 })] })), /הגודל/)
  assert.match(errorsOf(serviceBody({ assets: [asset({ port: 1023 })] })), /פורט/)
  assert.match(errorsOf(serviceBody({ assets: [asset({ port: 65536 })] })), /פורט/)
  assert.match(errorsOf(serviceBody({ assets: [asset(), asset({ name: 'b.msi' })] })), /כבר צורף מתקין/)
  assert.match(errorsOf(serviceBody({ assets: [asset(), asset({ arch: 'arm64', port: 18091 })] })), /אותו פורט/)
  assert.ok(validateDraftRequest(serviceBody({ assets: [asset(), asset({ os: 'linux', name: 'a.deb', port: 18091 })] })).ok)
  assert.match(errorsOf(serviceBody({ assets: [asset({ releaseUrl: 'https://github.com/other/repo/releases/download/v1/setup.exe' })] })), /ממאגרי המקור/)
  assert.ok(validateDraftRequest(serviceBody({ assets: [asset({ releaseUrl: 'https://github.com/owner/repo/releases/download/v1/setup.exe' })] })).ok, 'השוואת מאגר אינה תלוית רישיות')
  assert.match(errorsOf(serviceBody({ assets: [] })), /בין 1 ל-8 מתקינים/)
  assert.match(errorsOf(serviceBody({ assets: Array.from({ length: 9 }, (_, i) => asset({ arch: ARCH(i) })) })), /בין 1 ל-8/)
  for (const p of ['../plugin.otzplugin', '/abs/plugin.otzplugin', 'C:/x/plugin.otzplugin', 'a\\plugin.otzplugin', 'plugin.zip', 'a//plugin.otzplugin']) {
    assert.match(errorsOf(serviceBody({ assets: [asset({ bundledPluginPath: p })] })), /נתיב התוסף/, p)
  }
  assert.ok(validateDraftRequest(serviceBody({ assets: [asset({ bundledPluginPath: 'payload/files/My Plugin.OTZPLUGIN' })] })).ok)
  assert.match(errorsOf(serviceBody({ assets: [asset({ name: '../setup.exe' })] })), /שם הקובץ/)
  assert.match(errorsOf(serviceBody({ assets: [asset({ minOs: '' })] })), /מינימלית/)
})
const ARCH = (i) => ['x64', 'arm64', 'x86', 'universal'][i % 4]

test('validateDraftRequest: מקורות, הסרה, VirusTotal, גוף לא תקין', () => {
  assert.match(errorsOf(serviceBody({ sources: [] })), /מאגרי מקור/)
  assert.match(errorsOf(serviceBody({ sources: Array.from({ length: 5 }, (_, i) => ({ repository: `o/r${i}`, commit: COMMIT })) })), /מאגרי מקור/)
  assert.match(errorsOf(serviceBody({ sources: [{ repository: 'OWNER/REPO', commit: COMMIT }, { repository: 'owner/repo', commit: COMMIT }] })), /יותר מפעם אחת/)
  assert.match(errorsOf(serviceBody({ sources: [{ repository: 'OWNER/REPO', commit: 'abc' }] })), /commit מלא/)
  assert.match(errorsOf(serviceBody({ uninstall: '  ' })), /הוראות הסרה/)
  assert.match(errorsOf(serviceBody({ uninstall: 'x'.repeat(2001) })), /הוראות הסרה/)
  assert.match(errorsOf(serviceBody({ virusTotalConsent: 'yes' })), /VirusTotal/)
  assert.match(errorsOf(serviceBody({ changeNotes: 'x'.repeat(2001) })), /הערות השינוי/)
  assert.match(errorsOf(serviceBody({ pluginSize: LIMITS.pluginBytes + 1 })), /גודל קובץ התוסף/)
  assert.match(errorsOf(serviceBody({ serviceRange: { min: '2.0.0', max: '1.0.0' } })), /טווח/)
  assert.equal(validateDraftRequest(null).ok, false)
  assert.equal(validateDraftRequest([]).ok, false)
  assert.match(errorsOf({ kind: 'other' }), /סוג ההגשה/)
})

test('validateDraftRequest: עדכון תוסף בלבד', () => {
  const ctx = { hasApprovedService: true, currentServiceVersion: '1.2.0', currentPluginVersion: '1.0.0', publishedPluginVersions: ['1.0.0'] }
  const ok = validateDraftRequest(pluginBody(), ctx)
  assert.equal(ok.ok, true, ok.errors?.join('\n'))
  assert.deepEqual(ok.value.assets, [])
  assert.equal(ok.value.serviceVersion, null)
  assert.match(errorsOf(pluginBody(), { ...ctx, hasApprovedService: false }), /רק אחרי שפורסם שירות/)
  assert.match(errorsOf(pluginBody({ serviceRange: { min: '1.3.0', max: null } }), ctx), /אינה בטווח/)
  assert.match(errorsOf(pluginBody({ assets: [asset()] }), ctx), /אין לצרף מתקינים/)
  assert.match(errorsOf(pluginBody({ serviceVersion: '1.3.0' }), ctx), /אין לציין גרסת שירות/)
  assert.match(errorsOf(pluginBody({ uninstall: 'x' }), ctx), /הוראות ההסרה/)
})

test('canonicalJson: מפתחות ממוינים ברקורסיה, בלי רווחים', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}')
  assert.equal(canonicalJson({ a: undefined, b: 'א' }), '{"b":"א"}')
  assert.throws(() => canonicalJson({ a: Infinity }))
})

const reviewForDigest = (extra = {}) => ({
  policyVersion: 2, pluginId: 'abcdefabcdefabcdefabcdef', kind: 'service', pluginVersion: '1.0.0', serviceVersion: '1.0.0',
  serviceRange: { min: '1.0.0', max: null }, sources: [{ repository: 'o/r', commit: COMMIT }], uninstall: 'x', virusTotalConsent: false,
  pluginAsset: { size: 10, sha256: 'a'.repeat(64), receivedAt: new Date() },
  assets: [{ key: 'native0', name: 'a.exe', size: 5, sha256: 'b'.repeat(64), os: 'windows', arch: 'x64', minOs: '10', port: 18090, bundledPluginPath: 'p.otzplugin', releaseUrl: 'https://github.com/o/r/releases/download/v1/a.exe', receivedAt: new Date() }],
  manifest: { id: 'org.x', version: '1.0.0', permissions: ['network.localhost'] },
  changeNotes: 'לא בתוך ה-digest',
  ...extra,
})

test('submissionDigest: יציב לסדר מפתחות ולשדות שאינם בזהות, משתנה בכל hash/מקור/מדיניות', () => {
  const base = submissionDigest(reviewForDigest())
  assert.match(base, /^[a-f0-9]{64}$/)
  assert.equal(submissionDigest(reviewForDigest({ manifest: { permissions: ['network.localhost'], version: '1.0.0', id: 'org.x' } })), base)
  assert.equal(submissionDigest(reviewForDigest({ changeNotes: 'אחר', status: 'queued' })), base)
  assert.notEqual(submissionDigest(reviewForDigest({ pluginAsset: { size: 10, sha256: 'c'.repeat(64) } })), base)
  assert.notEqual(submissionDigest(reviewForDigest({ sources: [{ repository: 'o/r', commit: 'f'.repeat(40) }] })), base)
  assert.notEqual(submissionDigest(reviewForDigest({ policyVersion: 3 })), base)
  assert.notEqual(submissionDigest(reviewForDigest({ virusTotalConsent: true })), base)
  const r = reviewForDigest()
  r.assets[0].sha256 = 'd'.repeat(64)
  assert.notEqual(submissionDigest(r), base)
})

test('מכונת המצבים', () => {
  assert.ok(canTransition('draft', 'sealing'))
  assert.ok(canTransition('pending_admin', 'queued'))
  assert.ok(canTransition('running', 'waiting_quota'))
  assert.ok(canTransition('needs_operator', 'queued'))
  assert.ok(!canTransition('approved', 'running'))
  assert.ok(!canTransition('rejected', 'queued'))
  assert.ok(!canTransition('draft', 'queued'))
  for (const s of ACTIVE_STATUSES) assert.ok(canTransition(s, 'cancelled'), s)
  assert.deepEqual(STATUSES.filter((s) => !ACTIVE_STATUSES.includes(s)), ['approved', 'rejected', 'cancelled'])
  assert.equal(ASSET_KEYS.length, 9)
})

test('ניסיונות חוזרים: דקה, חמש דקות, ואז מפעיל', () => {
  const now = new Date('2026-10-24T10:00:00Z')
  assert.deepEqual(nextAfterTransientFailure(1, now), { status: 'retry_wait', nextAttemptAt: new Date(now.getTime() + 60_000) })
  assert.deepEqual(nextAfterTransientFailure(2, now), { status: 'retry_wait', nextAttemptAt: new Date(now.getTime() + 300_000) })
  assert.deepEqual(nextAfterTransientFailure(3, now), { status: 'needs_operator' })
})

test('מכסה: מועד אמין + דקה; לא אמין 6 שעות + דקה; אחרי שתי המתנות לא ידועות — מפעיל', () => {
  const now = new Date('2026-10-24T10:00:00Z')
  const resetAt = new Date(now.getTime() + 3600_000)
  assert.deepEqual(nextAfterQuota({ resetAt, unknownWaits: 1, now }), { status: 'waiting_quota', nextAttemptAt: new Date(resetAt.getTime() + QUOTA_RESET_GRACE_MS), unknownWaits: 1 })
  assert.equal(nextAfterQuota({ resetAt: resetAt.toISOString(), now }).nextAttemptAt.getTime(), resetAt.getTime() + 60_000)
  const unknown = nextAfterQuota({ resetAt: null, unknownWaits: 0, now })
  assert.deepEqual(unknown, { status: 'waiting_quota', nextAttemptAt: new Date(now.getTime() + QUOTA_UNKNOWN_WAIT_MS), unknownWaits: 1 })
  assert.equal(nextAfterQuota({ resetAt: new Date(now.getTime() - 1000), unknownWaits: 1, now }).unknownWaits, 2, 'עבר → לא אמין')
  assert.equal(nextAfterQuota({ resetAt: new Date(now.getTime() + 9 * 24 * 3600_000), now }).unknownWaits, 1, 'רחוק מדי → לא אמין')
  assert.deepEqual(nextAfterQuota({ resetAt: 'garbage', unknownWaits: 2, now }), { status: 'needs_operator' })
})

test('21 יום', () => {
  const start = new Date('2026-10-01T00:00:00Z')
  assert.deepEqual(cooldownState(null), { blocked: false, nextAllowedAt: null })
  const s = cooldownState(start, new Date('2026-10-21T23:59:59Z'))
  assert.equal(s.blocked, true)
  assert.equal(s.nextAllowedAt.toISOString(), '2026-10-22T00:00:00.000Z')
  assert.equal(cooldownState(start, new Date('2026-10-22T00:00:00Z')).blocked, false)
})

test('validateDecision: 0|1 בלבד ודוח לא ריק עד 64KiB', () => {
  assert.deepEqual(validateDecision({ decision: 1, report: 'תקין' }), { ok: true, decision: 1, report: 'תקין' })
  for (const bad of [null, [], { decision: '1', report: 'x' }, { decision: true, report: 'x' }, { decision: 2, report: 'x' }, { decision: 0, report: ' ' }, { decision: 0 }]) {
    assert.equal(validateDecision(bad).ok, false, JSON.stringify(bad))
  }
  assert.equal(validateDecision({ decision: 0, report: 'א'.repeat(40_000) }).ok, false, '80KB ב-UTF-8')
})

test('missingReceipts: רק קבלות עם אותו digest נחשבות', () => {
  const review = { kind: 'plugin', manifestDigest: 'd1', receipts: REQUIRED_RECEIPTS.plugin.map((stage) => ({ stage, digest: 'd1' })) }
  assert.deepEqual(missingReceipts(review), [])
  review.receipts[0].digest = 'old'
  assert.deepEqual(missingReceipts(review), ['hashes'])
  assert.deepEqual(missingReceipts({ kind: 'service', manifestDigest: 'd1', receipts: review.receipts }), ['hashes', 'release', 'extract', 'attestation'])
})

test('missingReceipts: קבלת דחייה אינה נחשבת מעבר של השלב', () => {
  const receipts = REQUIRED_RECEIPTS.plugin.map((stage) => ({ stage, digest: 'd1', data: stage === 'clamav' ? { rejected: true, reason: 'x' } : {} }))
  assert.deepEqual(missingReceipts({ kind: 'plugin', manifestDigest: 'd1', receipts }), ['clamav'])
})


test('הוראות הסרה מקבלות שורות, CRLF וטאבים, אך דוחות תווי בקרה אחרים', () => {
  for (const uninstall of ['1. עצירת השירות\n2. הסרת התוכנה', 'עצירה\r\n\tהסרה']) {
    const result = validateDraftRequest(serviceBody({ uninstall }))
    assert.equal(result.ok, true)
    assert.equal(result.value.uninstall, uninstall.trim())
  }
  for (const uninstall of ['\n\t ', 'הסרה\0', 'הסרה\x1b[0m', 'א'.repeat(2001)]) {
    assert.match(errorsOf(serviceBody({ uninstall })), /הוראות הסרה/)
  }
  assert.match(errorsOf(serviceBody({ assets: [asset({ minOs: 'Windows\n10' })] })), /מערכת מינימלית/)
})
