import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADMIN_NAV_ITEMS,
  ADMIN_NAV_GROUPS,
  buildAdminNavGroups,
  visibleNavItems,
  navItemMatches,
  getActiveNavItemId,
  navItemCount,
  countAccessibleLabel,
  buildAttentionItems,
  attentionTotal,
  canSeeNavItem,
  toAdminViewer,
  adminScreenTitle,
  adminNavGroupLabel,
} from './adminNav.js'
import { canHandleCorrections, canManageLibrarySync, canModerateLibrary } from './roles.js'

// שורת הלשוניות הקודמת (AdminNav לפני סרגל הצד): id → [כתובת, תפקידים]. הסרגל חייב
// לשמור על אותן כתובות והרשאות בדיוק. השמות השתנו — לפי מילון השמות (למטה).
const PREVIOUS_TABS = {
  dashboard: ['/library/admin', ['admin', 'admin_books', 'admin_plugins', 'admin_books_only', 'admin_ocr', 'model_trainer']],
  users: ['/library/admin/users', ['admin']],
  books: ['/library/admin/books', ['admin', 'admin_books', 'admin_books_only']],
  uploads: ['/library/admin/uploads', ['admin', 'admin_books']],
  plugins: ['/library/admin/plugins', ['admin', 'admin_plugins']],
  // "תוספים" פוצל לארבעה פריטים באותו עמוד (?view=) — אותן הרשאות בדיוק כמו "תוספים" הקודם
  'plugins-store': ['/library/admin/plugins?view=store', ['admin', 'admin_plugins']],
  'plugins-layout': ['/library/admin/plugins?view=layout', ['admin', 'admin_plugins']],
  'plugins-service': ['/library/admin/plugins?view=service', ['admin', 'admin_plugins']],
  pages: ['/library/admin/pages-management', ['admin', 'admin_books']],
  'ocr-training': ['/library/admin/ocr-training', ['admin', 'admin_ocr', 'model_trainer']],
  'ocr-lines': ['/library/admin/ocr-lines', ['admin', 'admin_ocr', 'model_trainer']],
  'ocr-layout': ['/library/admin/ocr-layout', ['admin', 'admin_ocr', 'model_trainer']],
  'page-proof': ['/library/admin/page-proof', ['admin', 'admin_ocr', 'model_trainer']],
  'tzurat-hadaf': ['/library/admin/tzurat-hadaf', ['admin', 'admin_books']],
  messages: ['/library/admin/messages', ['admin', 'admin_plugins', 'admin_books']],
  // "תזכורות" עבר ללשונית ב"הודעות" (?view=reminders); /library/admin/reminders מפנה לשם. אותן הרשאות בדיוק
  reminders: ['/library/admin/messages?view=reminders', ['admin', 'admin_books']],
  dictionary: ['/library/admin/dictionary', ['admin', 'admin_books']],
  'book-info': ['/library/admin/book-info', ['admin', 'admin_books']],
  corrections: ['/library/corrections', ['admin', 'admin_books']],
  // שני מסכי מרחב העריכה — היו מחוץ לסרגל (Header של האתר); עכשיו פריטים בסרגל, באותן כתובות
  moderation: ['/library/dicta-edit/moderation', ['admin', 'admin_books']],
  conflicts: ['/library/dicta-edit/conflicts', ['admin', 'admin_books']],
  'app-reports': ['/library/admin/app-reports', ['admin', 'developer']],
  'search-feedback': ['/library/admin/search-feedback', ['admin', 'model_trainer']],
  'private-sources': ['/library/admin/private-sources', ['admin']],
}

// מילון השמות של הניהול, טבלה 2 ("הסרגל"): id → [קבוצה, היום, חדש]. העמודה "חדש" היא מקור
// האמת לשם בסרגל (ומשם — גם לשם הכרטיס בלוח). "ללא שינוי" במילון = אותו שם בשתי העמודות.
const NAME_DICTIONARY = {
  dashboard: [null, 'דשבורד', 'לוח'],
  books: ['ספרים', 'ספרים', 'ספרים'],
  uploads: ['ספרים', 'העלאות', 'העלאות'],
  pages: ['ספרים', 'עמודים', 'עמודים'],
  'tzurat-hadaf': ['ספרים', 'צורת הדף', 'צורת הדף'],
  'book-info': ['ספרים', 'מידע על ספרים', 'פרטי ספרים'],
  dictionary: ['ספרים', 'מילון', 'הצעות למילון'],
  corrections: ['ספרים', 'תיקוני טקסט', 'דיווחי טעויות'],
  // מילון השמות, סעיף 5: השמות שנבחרו בשלב הלוח
  moderation: ['ספרים', 'תור אישורים', 'הצעות עריכה'],
  conflicts: ['ספרים', 'קונפליקטים בסנכרון', 'התנגשויות בסנכרון'],
  'ocr-training': ['אימון מודלים', 'מאגר אימון OCR', 'עמודים לאימון'],
  'ocr-lines': ['אימון מודלים', 'תמלול שורות OCR', 'תמלול שורות'],
  'ocr-layout': ['אימון מודלים', 'תיוג מבנה עמוד', 'תיוג מבנה'],
  'page-proof': ['אימון מודלים', 'הגהה לאימון', 'הגהה'],
  'search-feedback': ['אימון מודלים', 'משוב חיפוש', 'משוב חיפוש'],
  // מילון השמות, סעיף 6: "פיצול 'תוספים' לארבעה פריטים" (שמות לפי התוכנית, 6.17–6.20)
  plugins: ['תוספים', 'תוספים', 'לאישור'],
  'plugins-store': ['תוספים', 'תוספים', 'בחנות'],
  'plugins-layout': ['תוספים', 'תוספים', 'סידור החנות'],
  'plugins-service': ['תוספים', 'תוספים', 'תוספי שירות'],
  users: ['אנשים', 'משתמשים', 'משתמשים'],
  messages: ['אנשים', 'הודעות', 'הודעות'],
  reminders: ['אנשים', 'תזכורות', 'תזכורות'],
  'app-reports': ['מערכת', 'דיווחי תוכנה', 'דיווחי תקלות'],
  'private-sources': ['מערכת', 'מקורות ספרים פרטיים', 'מקורות פרטיים'],
}

const ROLES = ['admin', 'admin_books', 'admin_plugins', 'admin_books_only', 'admin_ocr', 'model_trainer', 'developer']
const ids = (role) => visibleNavItems(role).map((item) => item.id)

test('כתובות והרשאות זהות לשורת הלשוניות הקודמת', () => {
  assert.deepEqual(Object.keys(ADMIN_NAV_ITEMS).sort(), Object.keys(PREVIOUS_TABS).sort())
  for (const [id, [href, roles]] of Object.entries(PREVIOUS_TABS)) {
    const item = ADMIN_NAV_ITEMS[id]
    assert.equal(item.href, href, id)
    assert.deepEqual([...item.roles].sort(), [...roles].sort(), id)
  }
})

test('שמות הסרגל תואמים בדיוק לעמודה "חדש" במילון השמות, ובקבוצה שבמילון', () => {
  assert.deepEqual(Object.keys(NAME_DICTIONARY).sort(), Object.keys(ADMIN_NAV_ITEMS).sort())
  for (const [id, [groupLabel, , label]] of Object.entries(NAME_DICTIONARY)) {
    assert.equal(ADMIN_NAV_ITEMS[id].label, label, id)
    const group = ADMIN_NAV_GROUPS.find((g) => g.items.includes(id))
    assert.equal(group.label, groupLabel, id)
  }
  // אף שם ישן (שהשתנה) לא נשאר בסרגל
  const labels = Object.values(ADMIN_NAV_ITEMS).map((item) => item.label)
  for (const [, before, after] of Object.values(NAME_DICTIONARY)) {
    if (before !== after) assert.equal(labels.includes(before), false, before)
  }
})

test('"ממתין לטיפולך" בסרגל: השמות לפי המילון', () => {
  const items = buildAttentionItems('admin', { unreadMessages: 2, pendingUploads: 2, pendingPlugins: 2 })
  assert.deepEqual(items.map((i) => i.label), ['הודעות שלא נקראו', 'העלאות שלא נבדקו', 'תוספים לאישור'])
})

test('כל פריט שייך לקבוצה אחת בדיוק', () => {
  const all = ADMIN_NAV_GROUPS.flatMap((group) => group.items)
  assert.equal(new Set(all).size, all.length)
  assert.deepEqual([...all].sort(), Object.keys(ADMIN_NAV_ITEMS).sort())
})

test('כל תפקיד רואה בדיוק את מה שראה קודם', () => {
  for (const role of ROLES) {
    const expected = Object.entries(PREVIOUS_TABS).filter(([, [, roles]]) => roles.includes(role)).map(([id]) => id).sort()
    assert.deepEqual([...ids(role)].sort(), expected, role)
  }
})

test('בלי תפקיד / משתמש רגיל — אין פריטים', () => {
  assert.deepEqual(buildAdminNavGroups(undefined), [])
  assert.deepEqual(buildAdminNavGroups('user'), [])
})

test('מנהל כללי: הסדר והקבוצות', () => {
  const groups = buildAdminNavGroups('admin')
  assert.deepEqual(groups.map((g) => [g.id, g.label]), [
    ['home', null],
    ['books', 'ספרים'],
    ['training', 'אימון מודלים'],
    ['plugins', 'תוספים'],
    ['people', 'אנשים'],
    ['system', 'מערכת'],
  ])
  assert.deepEqual(groups[1].items.map((i) => i.label), ['ספרים', 'העלאות', 'עמודים', 'צורת הדף', 'פרטי ספרים', 'הצעות למילון', 'דיווחי טעויות', 'הצעות עריכה', 'התנגשויות בסנכרון'])
  assert.deepEqual(groups[2].items.map((i) => i.label), ['עמודים לאימון', 'תמלול שורות', 'תיוג מבנה', 'הגהה', 'משוב חיפוש'])
  assert.deepEqual(groups[3].items.map((i) => i.label), ['לאישור', 'בחנות', 'סידור החנות', 'תוספי שירות'])
  assert.deepEqual(groups[4].items.map((i) => i.label), ['משתמשים', 'הודעות', 'תזכורות'])
  assert.deepEqual(groups[5].items.map((i) => i.label), ['דיווחי תקלות', 'מקורות פרטיים'])
})

test('קבוצה שנשאר בה פריט אחד מוצגת בלי כותרת', () => {
  // מנהל תוספים: לוח, ארבעת פריטי התוספים (עם כותרת), ואצל "אנשים" רק הודעות
  assert.deepEqual(buildAdminNavGroups('admin_plugins').map((g) => [g.id, g.label, g.items.map((i) => i.id)]), [
    ['home', null, ['dashboard']],
    ['plugins', 'תוספים', ['plugins', 'plugins-store', 'plugins-layout', 'plugins-service']],
    ['people', null, ['messages']],
  ])
  // מנהל ספרים: "מערכת" ריקה לגמרי ונעלמת; "אנשים" עם שני פריטים — עם כותרת
  const books = buildAdminNavGroups('admin_books')
  assert.equal(books.find((g) => g.id === 'system'), undefined)
  assert.equal(books.find((g) => g.id === 'people').label, 'אנשים')
  // מאמן מודלים: "אימון מודלים" עם כותרת
  assert.deepEqual(buildAdminNavGroups('model_trainer').map((g) => [g.id, g.label]), [['home', null], ['training', 'אימון מודלים']])
})

test('תפקידים מצומצמים: מפתח ומנהל ספרים-בלבד', () => {
  assert.deepEqual(buildAdminNavGroups('developer').map((g) => [g.id, g.label, g.items.map((i) => i.id)]), [['system', null, ['app-reports']]])
  assert.deepEqual(buildAdminNavGroups('admin_books_only').map((g) => [g.id, g.label, g.items.map((i) => i.id)]), [
    ['home', null, ['dashboard']],
    ['books', null, ['books']],
  ])
})

test('פריט פעיל: התאמה מדויקת ודפי משנה', () => {
  const items = visibleNavItems('admin')
  const cases = {
    '/library/admin': 'dashboard',
    '/library/admin/': 'dashboard',
    '/library/admin/books': 'books',
    '/library/admin/books/categories': 'books',
    '/library/admin/uploads': 'uploads',
    '/library/admin/uploads/edit/abc123': 'uploads',
    '/library/admin/trash': 'uploads',
    '/library/admin/app-reports/66aa': 'app-reports',
    '/library/admin/plugins?tab=pending': 'plugins',
    '/library/admin/plugins': 'plugins',
    '/library/admin/plugins?view=pending': 'plugins',
    '/library/admin/plugins?view=store': 'plugins-store',
    '/library/admin/plugins?view=layout&q=x': 'plugins-layout',
    '/library/admin/plugins?view=service': 'plugins-service',
    // כתובות ישנות של המסך הקודם ותצוגה לא מוכרת
    '/library/admin/plugins?tab=approved': 'plugins-store',
    '/library/admin/plugins?tab=store': 'plugins-layout',
    '/library/admin/plugins?view=nope': 'plugins',
    // view לא מוכר עם tab ישן — כמו המסך (viewFromParams): ה-tab קובע
    '/library/admin/plugins?view=nope&tab=approved': 'plugins-store',
    '/library/admin/pages-management': 'pages',
    '/library/corrections': 'corrections',
    '/library/corrections/123': 'corrections',
    '/library/dicta-edit/moderation': 'moderation',
    '/library/dicta-edit/conflicts': 'conflicts',
  }
  for (const [path, expected] of Object.entries(cases)) {
    assert.equal(getActiveNavItemId(items, path), expected, path)
  }
})

test('תצוגות התוספים: search בנפרד מהכתובת, ובדיוק פריט אחד פעיל', () => {
  const items = visibleNavItems('admin_plugins')
  assert.equal(getActiveNavItemId(items, '/library/admin/plugins', new URLSearchParams('view=store')), 'plugins-store')
  assert.equal(getActiveNavItemId(items, '/library/admin/plugins', new URLSearchParams('')), 'plugins')
  assert.equal(getActiveNavItemId(items, '/library/admin/plugins', new URLSearchParams('tab=service')), 'plugins-service')
  for (const view of ['pending', 'store', 'layout', 'service']) {
    const active = items.filter((item) => navItemMatches(item, '/library/admin/plugins', new URLSearchParams(`view=${view}`)))
    assert.equal(active.length, 1, view)
  }
  // עמוד אחר עם ?view= — לא מסמן תוספים
  assert.equal(getActiveNavItemId(visibleNavItems('admin'), '/library/admin/books', new URLSearchParams('view=store')), 'books')
})

test('הלוח פעיל רק בהתאמה מדויקת; כתובת לא מוכרת — אין פריט פעיל', () => {
  const items = visibleNavItems('admin')
  assert.equal(navItemMatches(ADMIN_NAV_ITEMS.dashboard, '/library/admin/users'), false)
  assert.equal(getActiveNavItemId(items, '/library/admin/unknown-page'), null)
  // קידומת דומה אינה דף משנה
  assert.equal(getActiveNavItemId(items, '/library/admin/booksX'), null)
  assert.equal(getActiveNavItemId(items, '/library/admin/trashcan'), null)
  assert.equal(getActiveNavItemId(items, ''), null)
  assert.equal(getActiveNavItemId(items, null), null)
})

test('מונה פריט: רק לפריט עם מונה, ורק מספר חיובי', () => {
  const counts = { unreadMessages: 3, pendingUploads: 0, pendingPlugins: 2 }
  assert.equal(navItemCount(ADMIN_NAV_ITEMS.messages, counts), 3)
  assert.equal(navItemCount(ADMIN_NAV_ITEMS.uploads, counts), 0)
  assert.equal(navItemCount(ADMIN_NAV_ITEMS.plugins, counts), 2)
  assert.equal(navItemCount(ADMIN_NAV_ITEMS.books, counts), 0)
  assert.equal(navItemCount(ADMIN_NAV_ITEMS.messages, null), 0)
  assert.equal(navItemCount(ADMIN_NAV_ITEMS.messages, { unreadMessages: -1 }), 0)
  assert.equal(navItemCount(ADMIN_NAV_ITEMS.messages, { unreadMessages: 'x' }), 0)
})

test('טקסט נגיש למונה, ביחיד וברבים', () => {
  assert.equal(countAccessibleLabel('unreadMessages', 3), '3 הודעות שלא נקראו')
  assert.equal(countAccessibleLabel('unreadMessages', 1), 'הודעה אחת שלא נקראה')
  assert.equal(countAccessibleLabel('pendingUploads', 11), '11 העלאות שלא נבדקו')
  assert.equal(countAccessibleLabel('pendingUploads', 1), 'העלאה אחת שלא נבדקה')
  assert.equal(countAccessibleLabel('pendingPlugins', 2), '2 תוספים לאישור')
  assert.equal(countAccessibleLabel('pendingPlugins', 1), 'תוסף אחד לאישור')
})

test('"ממתין לטיפולך": רק מונים גדולים מ-0, הודעות ראשונות', () => {
  const counts = { unreadMessages: 3, pendingUploads: 11, pendingPlugins: 2 }
  const admin = buildAttentionItems('admin', counts)
  assert.deepEqual(admin.map((i) => [i.id, i.count, i.label]), [
    ['messages', 3, 'הודעות שלא נקראו'],
    ['uploads', 11, 'העלאות שלא נבדקו'],
    ['plugins', 2, 'תוספים לאישור'],
  ])
  assert.equal(admin[0].href, '/library/admin/messages')
  assert.equal(admin[0].accessibleLabel, '3 הודעות שלא נקראו')
  assert.equal(attentionTotal(admin), 16)

  assert.deepEqual(buildAttentionItems('admin', { unreadMessages: 0, pendingUploads: 4, pendingPlugins: 0 }).map((i) => i.id), ['uploads'])
})

test('"ממתין לטיפולך" ריק כשאין כלום — הקבוצה נעלמת', () => {
  assert.deepEqual(buildAttentionItems('admin', { unreadMessages: 0, pendingUploads: 0, pendingPlugins: 0 }), [])
  assert.deepEqual(buildAttentionItems('admin', null), [])
  assert.equal(attentionTotal([]), 0)
})

test('"ממתין לטיפולך" לפי תפקיד: רק מה שהתפקיד רואה', () => {
  const counts = { unreadMessages: 3, pendingUploads: 11, pendingPlugins: 2 }
  assert.deepEqual(buildAttentionItems('admin_plugins', counts).map((i) => i.id), ['messages', 'plugins'])
  assert.deepEqual(buildAttentionItems('admin_books', counts).map((i) => i.id), ['messages', 'uploads'])
  for (const role of ['admin_books_only', 'admin_ocr', 'model_trainer', 'developer']) {
    assert.deepEqual(buildAttentionItems(role, counts), [], role)
  }
})

test('כל הפריטים בתוך /library/admin, חוץ מתיקוני טקסט ומרחב העריכה (אותה מעטפת, כתובת משלהם)', () => {
  const outside = { corrections: '/library/corrections', moderation: '/library/dicta-edit/moderation', conflicts: '/library/dicta-edit/conflicts' }
  for (const item of Object.values(ADMIN_NAV_ITEMS)) {
    if (outside[item.id]) assert.equal(item.href, outside[item.id])
    else assert.ok(item.href.startsWith('/library/admin'), item.id)
    assert.equal('outside' in item, false, item.id)
  }
})

// כל צירופי תפקיד × דגלים — הפריט "תיקוני טקסט" מוצג בדיוק למי ש-API התיקונים מתיר
const ALL_ROLES = [undefined, 'user', ...ROLES]
const VIEWERS = ALL_ROLES.flatMap((role) => [
  { role },
  { role, isCorrectionsVolunteer: true },
  { role, isSupervisor: true },
  { role, isSupervisor: true, isCorrectionsVolunteer: true },
])

test('תיקוני טקסט מוצג בדיוק לפי canHandleCorrections (תפקיד או דגל מתנדב)', () => {
  for (const viewer of VIEWERS) {
    assert.equal(canSeeNavItem(ADMIN_NAV_ITEMS.corrections, viewer), canHandleCorrections(viewer), JSON.stringify(viewer))
  }
})

test('הצעות עריכה מוצג בדיוק לפי canModerateLibrary (תפקיד או דגל מפקח)', () => {
  for (const viewer of VIEWERS) {
    assert.equal(canSeeNavItem(ADMIN_NAV_ITEMS.moderation, viewer), canModerateLibrary(viewer), JSON.stringify(viewer))
  }
})

test('התנגשויות בסנכרון מוצג בדיוק לפי canManageLibrarySync (תפקיד בלבד — לא למפקח)', () => {
  for (const viewer of VIEWERS) {
    assert.equal(canSeeNavItem(ADMIN_NAV_ITEMS.conflicts, viewer), canManageLibrarySync(viewer), JSON.stringify(viewer))
  }
})

test('הדגלים מוסיפים רק את הפריט שלהם — שאר הפריטים לפי תפקיד בלבד', () => {
  const flagged = ['corrections', 'moderation']
  for (const role of ALL_ROLES) {
    const plain = visibleNavItems({ role }).map((i) => i.id)
    const withFlag = visibleNavItems({ role, isCorrectionsVolunteer: true, isSupervisor: true }).map((i) => i.id)
    assert.deepEqual(withFlag.filter((id) => !flagged.includes(id)), plain.filter((id) => !flagged.includes(id)), String(role))
  }
})

test('מתנדב תיקונים שהוא משתמש רגיל: סרגל של פריט אחד, בלי כותרת קבוצה ובלי לוח', () => {
  assert.deepEqual(buildAdminNavGroups({ role: 'user', isCorrectionsVolunteer: true }).map((g) => [g.id, g.label, g.items.map((i) => i.id)]), [
    ['books', null, ['corrections']],
  ])
  // מפקח בלי דגל מתנדב — אינו רשאי לטפל בתיקונים; יש לו רק "הצעות עריכה" (למטה)
  assert.equal(visibleNavItems({ role: 'user', isSupervisor: true }).some((i) => i.id === 'corrections'), false)
  // "ממתין לטיפולך" ריק גם כשיש מונים — אין לו אף אחד מהמסכים שלהם
  assert.deepEqual(buildAttentionItems({ role: 'user', isCorrectionsVolunteer: true }, { unreadMessages: 3, pendingUploads: 1, pendingPlugins: 1 }), [])
})

test('מפקח שהוא משתמש רגיל: סרגל של פריט אחד ("הצעות עריכה"), בלי כותרת ובלי לוח; עם דגל מתנדב — שניים', () => {
  assert.deepEqual(buildAdminNavGroups({ role: 'user', isSupervisor: true }).map((g) => [g.id, g.label, g.items.map((i) => i.id)]), [
    ['books', null, ['moderation']],
  ])
  assert.deepEqual(buildAdminNavGroups({ role: 'user', isSupervisor: true, isCorrectionsVolunteer: true }).map((g) => [g.id, g.label, g.items.map((i) => i.id)]), [
    ['books', 'ספרים', ['corrections', 'moderation']],
  ])
  assert.deepEqual(buildAttentionItems({ role: 'user', isSupervisor: true }, { unreadMessages: 3, pendingUploads: 1, pendingPlugins: 1 }), [])
})

test('מנהל OCR שהוא גם מתנדב: הפריטים שלו ועוד תיקוני טקסט', () => {
  assert.deepEqual(ids({ role: 'admin_ocr', isCorrectionsVolunteer: true }), ['dashboard', 'corrections', 'ocr-training', 'ocr-lines', 'ocr-layout', 'page-proof'])
})

test('toAdminViewer: מחרוזת תפקיד, session.user, ודגל רק כש-true ממש', () => {
  assert.deepEqual(toAdminViewer('admin'), { roles: ['admin'], isCorrectionsVolunteer: false, isSupervisor: false })
  assert.deepEqual(toAdminViewer(null), { roles: [], isCorrectionsVolunteer: false, isSupervisor: false })
  assert.deepEqual(toAdminViewer({ role: 'user', isCorrectionsVolunteer: 'true', isSupervisor: 1, name: 'x' }), { roles: [], isCorrectionsVolunteer: false, isSupervisor: false })
  assert.deepEqual(toAdminViewer({ role: 'user', isCorrectionsVolunteer: true }), { roles: [], isCorrectionsVolunteer: true, isSupervisor: false })
  assert.deepEqual(toAdminViewer({ role: 'user', isSupervisor: true }), { roles: [], isCorrectionsVolunteer: false, isSupervisor: true })
})

test('toAdminViewer: כמה תפקידים — מ-roles ומ-role יחד, ממוינים ובלי כפילויות', () => {
  assert.deepEqual(toAdminViewer({ role: 'admin_books', roles: ['admin_ocr', 'admin_books'] }).roles, ['admin_books', 'admin_ocr'])
  assert.deepEqual(toAdminViewer(['admin_ocr', 'developer']).roles, ['admin_ocr', 'developer'])
})

test('כמה תפקידים: הסרגל מציג את איחוד הפריטים של כל התפקידים', () => {
  const ids = (viewer) => new Set(visibleNavItems(viewer).map((i) => i.id))
  const combined = ids({ role: 'admin_books', roles: ['admin_books', 'admin_ocr'] })
  const union = new Set([...ids('admin_books'), ...ids('admin_ocr')])
  assert.deepEqual([...combined].sort(), [...union].sort())
  // מנהל ספרים לבד לא רואה OCR, ומנהל OCR לבד לא רואה העלאות — יחד רואים את שניהם
  assert.ok(!ids('admin_books').has('ocr-lines'))
  assert.ok(!ids('admin_ocr').has('uploads'))
  assert.ok(combined.has('ocr-lines') && combined.has('uploads'))
  // מפתח + מנהל OCR: גם דיווחי התקלות וגם אזורי ה-OCR
  const devOcr = ids(['developer', 'admin_ocr'])
  assert.ok(devOcr.has('app-reports') && devOcr.has('ocr-training') && devOcr.has('dashboard'))
})

test('כותרת המסך — השם שבסרגל; מסך של קבוצה — שם הקבוצה; מזהה לא מוכר — שגיאה', () => {
  assert.equal(adminScreenTitle('books'), 'ספרים')
  assert.equal(adminScreenTitle('moderation'), 'הצעות עריכה')
  assert.equal(adminScreenTitle('ocr-training'), 'עמודים לאימון')
  assert.equal(adminNavGroupLabel('plugins'), 'תוספים')
  assert.throws(() => adminScreenTitle('nope'))
  assert.throws(() => adminNavGroupLabel('home'))
})
