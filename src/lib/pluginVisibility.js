// השהיית תוסף מהחנות ("השהיה") — עזרים משותפים.
//
// השהיה היא מצב זמני ונפרד מאישור המנהל ומהסתרה:
//   isApproved  — אישור המנהל. בלעדיו התוסף אינו ציבורי כלל.
//   isHidden    — "מחיקה רכה" של מנהל. התוסף נעלם גם מהניהול.
//   isSuspended — השהיה. התוסף אינו מופיע בחנות ואינו ניתן להורדה, אך נשאר
//                 נגיש בקישור ישיר למעלה התוסף ולמנהלי התוספים בלבד.
//
// מי שהשהה נשמר ב-suspendedByRole: השהיית מנהל גוברת על המעלה — רק מנהל
// יכול להחזיר לחנות תוסף שהושהה בניהול.

// סינון תוספים מושהים בשאילתות ציבוריות. $ne:true (ולא false) כדי לכלול
// מסמכים ותיקים שנוצרו לפני הוספת השדה ואין בהם isSuspended כלל.
export const NOT_SUSPENDED_FILTER = { isSuspended: { $ne: true } }

export const SUSPEND_ACTIONS = ['suspend', 'resume']

export function isPluginSuspended(plugin) {
  return plugin?.isSuspended === true
}

// האם המשתמש רשאי לראות/להוריד תוסף מושהה בקישור ישיר
export function canAccessSuspended({ isAdmin, isOwner }) {
  return isAdmin === true || isOwner === true
}

// בדיקת חוקיות פעולת השהיה/החזרה. מחזיר null אם מותר, אחרת הודעת שגיאה בעברית.
export function suspensionError(plugin, action, { isAdmin = false } = {}) {
  if (action === 'suspend') {
    if (!plugin.isApproved) {
      return 'ניתן להשהות רק תוסף שאושר בניהול. תוסף שאינו מאושר ממילא אינו מופיע בחנות.'
    }
    if (isPluginSuspended(plugin)) {
      return 'התוסף כבר מושהה.'
    }
    return null
  }

  if (action === 'resume') {
    if (!isPluginSuspended(plugin)) {
      return 'התוסף אינו מושהה.'
    }
    if (!isAdmin && plugin.suspendedByRole === 'admin') {
      return 'התוסף הושהה על ידי הנהלת האתר. להחזרתו לחנות יש לפנות למנהל.'
    }
    if (!plugin.isApproved) {
      return 'האישור של התוסף בוטל בניהול, ולכן לא ניתן להחזירו לחנות. יש לפנות למנהל.'
    }
    return null
  }

  return 'פעולה לא נתמכת.'
}

// החלת הפעולה על מסמך התוסף (ללא שמירה)
export function applySuspension(plugin, action, { userId, isAdmin }) {
  if (action === 'suspend') {
    plugin.isSuspended = true
    plugin.suspendedAt = new Date()
    plugin.suspendedBy = userId || null
    plugin.suspendedByRole = isAdmin ? 'admin' : 'owner'
  } else {
    plugin.isSuspended = false
    plugin.suspendedAt = null
    plugin.suspendedBy = null
    plugin.suspendedByRole = null
  }
  return plugin
}

// שדות ההשהיה לתשובות API (אחיד בין הניהול לדף התוסף)
export function suspensionFields(plugin) {
  return {
    isSuspended: isPluginSuspended(plugin),
    suspendedByRole: plugin?.suspendedByRole || null,
    suspendedAt: plugin?.suspendedAt || null
  }
}
