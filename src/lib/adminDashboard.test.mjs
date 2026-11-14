import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DASHBOARD_QUEUES,
  QUEUE_ERROR_TEXT,
  URGENCY_TIERS,
  ageInDays,
  buildDashboardView,
  dashboardAnnouncement,
  buildGeneralStats,
  buildQueueCard,
  canSeeQueue,
  formatCount,
  formatPercent,
  formatSince,
  generalStatsScope,
  getDashboardQueue,
  hasGeneralStats,
  oldestLine,
  percentValue,
  queueIdentity,
  queueRoles,
  summaryLine,
  visibleQueues,
} from './adminDashboard.js'
import { ADMIN_NAV_ITEMS, visibleNavItems } from './adminNav.js'
import {
  canManageLibrarySync,
  canModerateLibrary,
  hasBooksAccess,
  hasOcrAccess,
  hasPluginsAccess,
  hasTzuratAdminAccess,
} from './roles.js'

const NOW = Date.UTC(2026, 10, 1, 12)
const DAY = 24 * 60 * 60 * 1000
const ids = (role) => visibleQueues(role).map((q) => q.id)
const ALL_ON = { servicePlugins: true }

test('כל מקום: מזהה ייחודי, קישור, תוויות, משפט שלילה, רמת דחיפות ותפקידים', () => {
  const seen = new Set()
  for (const q of DASHBOARD_QUEUES) {
    assert.ok(!seen.has(q.id), `כפול: ${q.id}`)
    seen.add(q.id)
    assert.ok(q.href.startsWith('/library/'), q.id)
    assert.ok(q.label.one && q.label.many, q.id)
    assert.match(q.clear, /^אין /, q.id)
    assert.ok(URGENCY_TIERS.includes(q.tier), q.id)
    assert.ok(queueRoles(q).length > 0, q.id)
    if (q.navItem) assert.ok(ADMIN_NAV_ITEMS[q.navItem], `פריט סרגל חסר: ${q.navItem}`)
    else assert.ok(q.title && q.icon, q.id)
  }
})

test('סדר הדחיפות: תקלות, החלטות, הודעות, צברים — הרמות לא יורדות לאורך הרשימה', () => {
  const ranks = DASHBOARD_QUEUES.map((q) => URGENCY_TIERS.indexOf(q.tier))
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b))
  assert.deepEqual(ids('admin').slice(0, 2), ['conflicts', 'corrections-failed'])
  assert.deepEqual(ids('admin').slice(-3), ['messages', 'uploads', 'dictionary'])
  assert.ok(!DASHBOARD_QUEUES.some((q) => q.id === 'stale-pages'))
})

test('אין שני כרטיסים עם אותו אייקון (סריקה בעין)', () => {
  const icons = DASHBOARD_QUEUES.map((q) => queueIdentity(q).icon)
  assert.equal(new Set(icons).size, icons.length)
})

test('תור של פריט בסרגל — בדיוק התפקידים שרואים את הפריט', () => {
  for (const q of DASHBOARD_QUEUES.filter((x) => x.navItem)) {
    assert.deepEqual(queueRoles(q), ADMIN_NAV_ITEMS[q.navItem].roles, q.id)
    for (const role of ['admin', 'admin_books', 'admin_books_only', 'admin_plugins', 'admin_ocr', 'model_trainer', 'developer', 'user']) {
      assert.equal(canSeeQueue(q, role), visibleNavItems(role).some((item) => item.id === q.navItem), `${q.id} / ${role}`)
    }
  }
})

test('תפקידי התורים תואמים לבדיקות ההרשאה של ה-API שלהם', () => {
  const roles = ['admin', 'admin_books', 'admin_books_only', 'admin_plugins', 'admin_ocr', 'model_trainer', 'developer']
  const expect = {
    messages: (r) => ['admin', 'admin_plugins', 'admin_books'].includes(r),
    uploads: hasBooksAccess,
    'tzurat-submissions': hasTzuratAdminAccess,
    'tzurat-disputes': hasTzuratAdminAccess,
    'tzurat-reports': hasTzuratAdminAccess,
    'book-info': hasBooksAccess,
    dictionary: hasBooksAccess,
    corrections: hasBooksAccess,
    'corrections-failed': hasBooksAccess,
    moderation: (r) => canModerateLibrary({ role: r }),
    conflicts: (r) => canManageLibrarySync({ role: r }),
    'ocr-lines': hasOcrAccess,
    'ocr-layout': hasOcrAccess,
    'proof-review': hasOcrAccess,
    'proof-volunteers': hasOcrAccess,
    plugins: hasPluginsAccess,
    'service-plugins': hasPluginsAccess,
  }
  assert.deepEqual(Object.keys(expect).sort(), DASHBOARD_QUEUES.map((q) => q.id).sort())
  for (const q of DASHBOARD_QUEUES) {
    for (const role of roles) assert.equal(canSeeQueue(q, role), expect[q.id](role), `${q.id} / ${role}`)
  }
})

test('מה כל תפקיד רואה', () => {
  assert.equal(ids('admin').length, DASHBOARD_QUEUES.length - 1)
  assert.equal(visibleQueues('admin', ALL_ON).length, DASHBOARD_QUEUES.length)
  assert.deepEqual(ids('admin_plugins'), ['plugins', 'messages'])
  assert.deepEqual(visibleQueues('admin_plugins', ALL_ON).map((q) => q.id), ['plugins', 'service-plugins', 'messages'])
  assert.deepEqual(ids('admin_ocr'), ['proof-review', 'ocr-lines', 'ocr-layout', 'proof-volunteers'])
  assert.deepEqual(ids('model_trainer'), ids('admin_ocr'))
  assert.deepEqual(ids('admin_books_only'), [])
  assert.deepEqual(ids('developer'), [])
  assert.deepEqual(ids(undefined), [])
  assert.ok(ids('admin_books').includes('moderation') && !ids('admin_books').includes('plugins'))
})

test('תוספי שירות — רק כשהתכונה פעילה (אחרת ה-API שלהם מחזיר "disabled")', () => {
  assert.ok(!ids('admin').includes('service-plugins'))
  assert.ok(!visibleQueues('admin', { servicePlugins: 'yes' }).some((q) => q.id === 'service-plugins'))
  assert.ok(visibleQueues('admin', ALL_ON).some((q) => q.id === 'service-plugins'))
})

test('שם ואייקון: מהסרגל, או מהגדרת התור', () => {
  assert.deepEqual(queueIdentity(getDashboardQueue('uploads')), { title: 'העלאות', icon: 'upload_file' })
  assert.deepEqual(queueIdentity(getDashboardQueue('moderation')), { title: 'הצעות עריכה', icon: 'rule' })
  // אותו מסך, אייקון ייעודי — כדי שכרטיסי "צורת הדף" לא ייראו זהים
  assert.deepEqual(queueIdentity(getDashboardQueue('tzurat-disputes')), { title: 'צורת הדף', icon: 'forum' })
})

test('formatCount: מפריד אלפים, ו"—" במקום undefined', () => {
  assert.equal(formatCount(3967), '3,967')
  assert.equal(formatCount(0), '0')
  for (const bad of [undefined, null, '', NaN, 'abc']) assert.equal(formatCount(bad), '—')
})

test('formatPercent / percentValue: 0 עד 100, ולא 100% כשלא הכול הושלם', () => {
  assert.equal(formatPercent(3870, 19955), '19.4%')
  assert.equal(formatPercent(0, 0), '—')
  assert.equal(formatPercent(undefined, 10), '—')
  assert.equal(formatPercent(999999, 1000000), '99.9%')
  assert.equal(formatPercent(1000000, 1000000), '100%')
  assert.equal(percentValue(120, 100), 100)
  assert.equal(percentValue(-5, 100), 0)
  assert.equal(percentValue(1, 100000), 0)
})

test('formatSince', () => {
  const ago = (d) => new Date(NOW - d * DAY - 1000)
  assert.equal(formatSince(ago(0), NOW), 'מהיום')
  assert.equal(formatSince(ago(1), NOW), 'מאתמול')
  assert.equal(formatSince(ago(2), NOW), 'מלפני יומיים')
  assert.equal(formatSince(ago(3), NOW), 'מלפני 3 ימים')
  assert.equal(formatSince(ago(7), NOW), 'מלפני שבוע')
  assert.equal(formatSince(ago(14), NOW), 'מלפני שבועיים')
  assert.equal(formatSince(ago(21), NOW), 'מלפני 3 שבועות')
  assert.equal(formatSince(ago(30), NOW), 'מלפני חודש')
  assert.equal(formatSince(ago(60), NOW), 'מלפני חודשיים')
  assert.equal(formatSince(ago(340), NOW), 'מלפני 11 חודשים')
  assert.equal(formatSince(ago(364), NOW), 'מלפני 11 חודשים')
  assert.equal(formatSince(ago(400), NOW), 'מלפני שנה')
  assert.equal(formatSince(ago(800), NOW), 'מלפני שנתיים')
  assert.equal(formatSince(ago(3).toISOString(), NOW), 'מלפני 3 ימים')
  for (const bad of [null, undefined, '', 'not a date']) assert.equal(formatSince(bad, NOW), null)
})

test('formatSince: ימים בלוח השנה (שעון ירושלים), לא בלוקים של 24 שעות', () => {
  // ישראל ב-UTC+2 בנובמבר: 06:00Z = 08:00 בבוקר
  const morning = Date.UTC(2026, 10, 2, 6)
  assert.equal(formatSince(new Date(Date.UTC(2026, 10, 1, 21)), morning), 'מאתמול') // אתמול ב-23:00
  assert.equal(formatSince(new Date(Date.UTC(2026, 10, 1, 22, 30)), morning), 'מהיום') // 00:30 הלילה
  const evening = Date.UTC(2026, 10, 2, 19)
  assert.equal(formatSince(new Date(Date.UTC(2026, 9, 31, 7)), evening), 'מלפני יומיים') // שלשום בבוקר, פחות מ-48 שעות
})

test('formatSince: תאריך עתידי — null (נתון שגוי), חוץ מסטיית שעון של דקות', () => {
  assert.equal(formatSince(new Date(NOW + DAY), NOW), null)
  assert.equal(formatSince(new Date(NOW + 365 * DAY), NOW), null)
  assert.equal(formatSince(new Date(NOW + 60 * 1000), NOW), 'מהיום')
  assert.equal(ageInDays(new Date(NOW + DAY), NOW), null)
})

test('oldestLine: מין דקדוקי לפי התור, ובלי שורה כשאין נתון', () => {
  const old = new Date(NOW - 3 * DAY)
  assert.equal(oldestLine(getDashboardQueue('uploads'), old, NOW), 'הוותיקה מלפני 3 ימים')
  assert.equal(oldestLine(getDashboardQueue('corrections'), old, NOW), 'הוותיק מלפני 3 ימים')
  // ספרים בהתנגשות — זכר ("הוותיק")
  assert.equal(oldestLine(getDashboardQueue('conflicts'), old, NOW), 'הוותיק מלפני 3 ימים')
  assert.equal(oldestLine(getDashboardQueue('uploads'), null, NOW), null)
  assert.equal(oldestLine(getDashboardQueue('dictionary'), old, NOW), null)
})

test('buildQueueCard: ממתין / ריק / שגיאה', () => {
  const q = getDashboardQueue('uploads')
  const pending = buildQueueCard(q, { status: 'ok', count: 3967, oldest: new Date(NOW - 3 * DAY) }, NOW)
  assert.equal(pending.state, 'pending')
  assert.equal(pending.countText, '3,967')
  assert.equal(pending.label, 'העלאות שלא נבדקו')
  // הכרטיס מוביל לתור המסונן, מהוותיקה לחדשה — אותו יעד כמו הקיצור בסרגל
  assert.equal(pending.href, '/library/admin/uploads?status=not_checked&sort=oldest')
  assert.equal(pending.note, 'הוותיקה מלפני 3 ימים')
  assert.equal(pending.title, 'העלאות')
  assert.equal(pending.accessibleName, 'העלאות: 3,967 העלאות שלא נבדקו. הוותיקה מלפני 3 ימים')

  assert.equal(buildQueueCard(q, { status: 'ok', count: 1 }, NOW).label, 'העלאה שלא נבדקה')
  const clear = buildQueueCard(q, { status: 'ok', count: 0 }, NOW)
  assert.equal(clear.state, 'clear')
  assert.equal(clear.label, 'אין העלאות שלא נבדקו')
  assert.equal(clear.accessibleName, 'העלאות: אין העלאות שלא נבדקו')
  assert.equal(buildQueueCard(q, { status: 'ok' }, NOW).state, 'clear')

  for (const bad of [undefined, { status: 'error' }]) {
    const card = buildQueueCard(q, bad, NOW)
    assert.equal(card.state, 'error')
    assert.equal(card.countText, '—')
    assert.equal(card.label, QUEUE_ERROR_TEXT)
    assert.ok(!JSON.stringify(card).includes('undefined'))
  }
})

test('הודעות שלא נטענו — בלי שלילה כפולה ("לא נטען · לא נקראו")', () => {
  const card = buildQueueCard(getDashboardQueue('messages'), { status: 'error' }, NOW)
  assert.equal(card.accessibleName, 'הודעות: לא הצלחנו לטעון את המספר')
})

test('הבלטה: תקלה — error; ותק חריג (14 ימים ומעלה) — warning רק במה שמחכה להחלטה ובהודעות', () => {
  const conflicts = buildQueueCard(getDashboardQueue('conflicts'), { status: 'ok', count: 3, oldest: new Date(NOW - DAY) }, NOW)
  assert.equal(conflicts.attention, 'error')
  assert.equal(conflicts.noteIsStale, false)
  const old = { status: 'ok', count: 5, oldest: new Date(NOW - 20 * DAY) }
  const lines = buildQueueCard(getDashboardQueue('ocr-lines'), old, NOW)
  assert.equal(lines.attention, 'warning')
  assert.equal(lines.noteIsStale, true)
  assert.equal(lines.note, 'הוותיקה מלפני שבועיים')
  assert.equal(buildQueueCard(getDashboardQueue('ocr-lines'), { ...old, oldest: new Date(NOW - 13 * DAY) }, NOW).attention, null)
  // צבר: תמיד ישן, ולכן בלי הבלטה
  assert.equal(buildQueueCard(getDashboardQueue('uploads'), { ...old, oldest: new Date(NOW - 300 * DAY) }, NOW).attention, null)
  // ותק חריג גובר על הפירוק
  const info = buildQueueCard(getDashboardQueue('book-info'), { ...old, parts: { legacy: 2 } }, NOW)
  assert.equal(info.note, 'הוותיקה מלפני שבועיים')
})

test('שורת המשנה: "איפה במסך" > פירוק > ותק', () => {
  const plugins = getDashboardQueue('plugins')
  assert.equal(buildQueueCard(plugins, { status: 'ok', count: 3, parts: { created: 2, updates: 1 }, oldest: new Date(NOW) }, NOW).note, '2 חדשים · עדכון אחד')
  // סוג אחד בלבד — הפירוק רק כופל את המספר, ולכן שורת הוותק
  assert.equal(buildQueueCard(plugins, { status: 'ok', count: 2, parts: { created: 2, updates: 0 }, oldest: new Date(NOW - DAY) }, NOW).note, 'הוותיק מאתמול')
  const service = getDashboardQueue('service-plugins')
  assert.equal(buildQueueCard(service, { status: 'ok', count: 3, parts: { pendingAdmin: 2, needsOperator: 1 } }, NOW).note, '2 מחכים לבדיקה · אחד נתקע')
  // התצוגה נפתחת מהכתובת — הכרטיס מוביל ישר אליה, ושמו כשם הפריט בסרגל
  assert.equal(service.href, '/library/admin/plugins?view=service')
  assert.equal(queueIdentity(service).title, 'תוספי שירות')
  assert.equal(queueIdentity(plugins).title, 'תוספים לאישור')
  assert.equal(service.detail({ pendingAdmin: 1, needsOperator: 2 }), 'אחד מחכה לבדיקה · 2 נתקעו')
  const failed = buildQueueCard(getDashboardQueue('corrections-failed'), { status: 'ok', count: 349 }, NOW)
  assert.equal(failed.note, 'בלשונית "אושרו / בפרסום"')
  const info = getDashboardQueue('book-info')
  assert.equal(buildQueueCard(info, { status: 'ok', count: 73, parts: { conflict: 1, legacy: 44 } }, NOW).note, 'אחת נתקעה וצריכה בדיקה · 44 מהן הצעות ישנות')
  assert.equal(buildQueueCard(info, { status: 'ok', count: 5, parts: {}, oldest: new Date(NOW - DAY) }, NOW).note, 'הוותיקה מאתמול')
})

test('הגהה לאימון: פירוק לפי חלק, והקישור פותח את החלק שיש בו הכי הרבה', () => {
  const q = getDashboardQueue('proof-review')
  const card = buildQueueCard(q, { status: 'ok', count: 86, parts: { ocr: 26, router: 60, frames: 0 } }, NOW)
  assert.equal(card.href, '/library/admin/page-proof?tab=review&sec=router')
  assert.equal(card.note, '26 בזיהוי טקסט · 60 בנתב הכתב')
  const one = buildQueueCard(q, { status: 'ok', count: 4, parts: { ocr: 0, router: 0, frames: 4 }, oldest: new Date(NOW) }, NOW)
  assert.equal(one.href, '/library/admin/page-proof?tab=review&sec=frames')
  assert.equal(one.note, 'הוותיקה מהיום')
  assert.equal(buildQueueCard(q, { status: 'ok', count: 1 }, NOW).href, q.href)
})

test('buildDashboardView: ממתינים וכשלים בכרטיסים (בסדר הדחיפות), ריקים ב"כבר מטופל"', () => {
  const view = buildDashboardView('admin_ocr', {
    'ocr-lines': { status: 'ok', count: 4 },
    'ocr-layout': { status: 'ok', count: 0 },
    'proof-review': { status: 'error' },
    'proof-volunteers': { status: 'ok', count: 0 },
  }, NOW)
  assert.deepEqual(view.cards.map((c) => c.id), ['proof-review', 'ocr-lines'])
  assert.deepEqual(view.clear.map((c) => c.id), ['ocr-layout', 'proof-volunteers'])
  assert.equal(view.pendingCount, 1)
  assert.equal(view.failedCount, 1)
  assert.equal(view.allClear, false)
  assert.equal(view.allFailed, false)
  assert.equal(view.summary, 'יש מה לטפל במקום אחד · מקום אחד לא נטען')
})

test('buildDashboardView: הכול 0 — בלי שורת סיכום (ההודעה "הכול מטופל" אומרת את זה)', () => {
  const results = Object.fromEntries(ids('admin_plugins').map((id) => [id, { status: 'ok', count: 0 }]))
  const view = buildDashboardView('admin_plugins', results, NOW)
  assert.equal(view.allClear, true)
  assert.equal(view.cards.length, 0)
  assert.equal(view.clear.length, 2)
  assert.equal(view.summary, null)
  assert.equal(dashboardAnnouncement(view), 'הכול מטופל')
})

test('buildDashboardView: כשל כללי (בלי תוצאות) — allFailed, הודעה אחת, לא "הכול מטופל"', () => {
  const view = buildDashboardView('admin_plugins', {}, NOW)
  assert.equal(view.allClear, false)
  assert.equal(view.allFailed, true)
  assert.equal(view.failedCount, 2)
  assert.equal(view.summary, null)
  assert.equal(dashboardAnnouncement(view), 'לא הצלחנו לטעון את מה שממתין לך')
})

test('buildDashboardView: תפקיד בלי מקומות', () => {
  const view = buildDashboardView('admin_books_only', {}, NOW)
  assert.equal(view.hasQueues, false)
  assert.equal(view.allClear, false)
  assert.equal(view.allFailed, false)
  assert.equal(view.summary, null)
  assert.equal(dashboardAnnouncement(view), null)
})

test('buildDashboardView: features עוברות הלאה — תוספי שירות רק כשהתכונה פעילה', () => {
  const results = { plugins: { status: 'ok', count: 0 }, 'service-plugins': { status: 'ok', count: 2 }, messages: { status: 'ok', count: 0 } }
  assert.equal(buildDashboardView('admin_plugins', results, NOW).allClear, true)
  assert.deepEqual(buildDashboardView('admin_plugins', results, NOW, { servicePlugins: true }).cards.map((c) => c.id), ['service-plugins'])
})

test('אף טקסט גלוי או נגיש לא מכיל את המילה "תור" (משוב המשתמש)', () => {
  for (const q of DASHBOARD_QUEUES) {
    const { title } = queueIdentity(q)
    for (const text of [title, q.label.one, q.label.many, q.clear, q.where ?? '']) assert.doesNotMatch(text, /תור/, q.id)
  }
  for (const [p, f] of [[0, 0], [1, 0], [3, 0], [0, 1], [2, 2]]) assert.doesNotMatch(summaryLine(5, p, f) ?? '', /תור/)
  assert.doesNotMatch(QUEUE_ERROR_TEXT, /תור/)
})

test('summaryLine: סופרת מקומות ואומרת זאת, ביחיד וברבים', () => {
  assert.equal(summaryLine(0, 0, 0), null)
  assert.equal(summaryLine(4, 0, 0), null)
  assert.equal(summaryLine(4, 1, 0), 'יש מה לטפל במקום אחד')
  assert.equal(summaryLine(4, 3, 0), 'יש מה לטפל ב-3 מקומות, הדחוף ראשון')
  assert.equal(summaryLine(4, 0, 2), '2 מקומות לא נטענו · כל השאר מטופל')
  assert.equal(summaryLine(4, 0, 1), 'מקום אחד לא נטען · כל השאר מטופל')
})

test('מצב כללי: רק לתפקידי ספרים; משתמשים ודיווחי תוכנה רק למנהל כללי', () => {
  assert.equal(hasGeneralStats('admin'), true)
  assert.equal(hasGeneralStats('admin_books'), true)
  assert.equal(hasGeneralStats('admin_books_only'), true)
  for (const role of ['admin_plugins', 'admin_ocr', 'model_trainer', 'developer', undefined]) assert.equal(hasGeneralStats(role), false)
  assert.deepEqual(generalStatsScope('admin'), { books: true, users: true, appReports: true })
  assert.deepEqual(generalStatsScope('admin_books'), { books: true, users: false, appReports: false })
})

test('buildGeneralStats', () => {
  const data = { books: 132, hiddenBooks: 85, totalPages: 19955, completedPages: 3870, inProgressPages: 14429, users: 2259, appReportsWeek: 425 }
  const admin = buildGeneralStats('admin', data)
  assert.deepEqual(admin.items.map((i) => i.id), ['books', 'pages', 'completed', 'in-progress', 'users', 'app-reports'])
  assert.equal(admin.items[0].hint, '85 לא מוצגים באתר')
  assert.equal(buildGeneralStats('admin', { ...data, hiddenBooks: 1 }).items[0].hint, 'ספר אחד לא מוצג באתר')
  assert.equal(admin.progress.percent, '19.4%')
  assert.equal(admin.progress.value, 19.4)
  assert.equal(admin.progress.text, '3,870 מתוך 19,955 עמודים הושלמו')
  // הסך הוא הערכה, ולכן אפשר שההושלמו יעברו אותו — הפס לא חורג מ-100
  assert.equal(buildGeneralStats('admin', { ...data, completedPages: 25000 }).progress.value, 100)

  const books = buildGeneralStats('admin_books', data)
  assert.ok(!books.items.some((i) => i.id === 'users'))

  // נתון חסר — "—", ובלי פס התקדמות; אף פעם לא undefined
  const empty = buildGeneralStats('admin_books_only', {})
  assert.ok(empty.items.every((i) => i.value === '—'))
  assert.equal(empty.progress, null)
  assert.ok(!JSON.stringify(empty).includes('undefined'))

  assert.deepEqual(buildGeneralStats('admin_ocr', data), { items: [], progress: null })
})

test('כרטיס ההעלאות: פותח את המסך מסונן ל"לא נבדק", מהוותיקה לחדשה (הסינון מהכתובת של מסך ההעלאות)', async () => {
  const { parseUploadsQuery } = await import('./adminUploads/uploadsQuery.js')
  const { QUEUE_STATUS } = await import('./adminUploads/uploadTerms.js')
  const url = new URL(getDashboardQueue('uploads').href, 'http://localhost')
  assert.equal(url.pathname, '/library/admin/uploads')
  const query = parseUploadsQuery(url.searchParams)
  assert.deepEqual(query.status, [QUEUE_STATUS])
  assert.equal(query.sort, 'oldest')
})
