'use client'

import Button from '@/components/ui/Button'
import { loginHref } from '@/lib/accountMenu'
import AccountMenu, { AccountMenuItems } from './AccountMenu'

/**
 * אזור החשבון בכותרת — משותף לכותרת הספרייה (Header) ולכותרת האתר בחנות התוספים
 * (OtzariaSoftwareHeader showAuth), כך שהוא נראה ומתנהג אותו דבר בכל האתר.
 *   אורח   — "התחבר" (ui/Button בגודל header, טקסט בלבד), ממלא את האזור.
 *   מחובר  — כפתור חשבון בלי שם: עיגול האות הראשונה וחץ (AccountMenu), ממלא את האזור. השם
 *            והאימייל — בתפריט שהוא פותח (האזור האישי, ניהול למורשים, התנתקות).
 *   טוען   — skeleton בגודל האזור (ה-session עוד לא הגיע מ-/api/auth/session).
 * שלושתם באותו רוחב בדיוק: גם אין קפיצה כשהמצב מתחלף, וגם אין רווח ריק בין "תרומות" לאזור
 * (הרווח ביניהם הוא ה-gap הרגיל של השורה).
 *
 * הרוחב — --account-slot-width (component-tokens.css), ותוכן האזור לא תלוי באורך השם.
 * ה-session נקרא בדפדפן בלבד, ולא בשרת, בכוונה — כך דפי השיווק והחנות נשארים זהים לכל
 * המבקרים וניתנים למטמון ציבורי (next.config.ts), ואין בהם HTML תלוי-משתמש.
 *
 * compact — בתוך התפריט הנייד: "התחבר" ברוחב מלא, ולמחובר — תוכן התפריט עצמו (בלי כפתור).
 * loginCallbackUrl — לאן לחזור אחרי ההתחברות (בחנות: הדף הנוכחי; בספרייה: ברירת המחדל).
 * signOutCallbackUrl — לאן לעבור אחרי ההתנתקות.
 * onNavigate — סוגר את התפריט הנייד אחרי לחיצה על קישור.
 */
export default function AccountActions({
  session,
  status,
  unreadMessages = 0,
  compact = false,
  onNavigate,
  loginCallbackUrl,
  signOutCallbackUrl = '/auth/login'
}) {
  const loading = status === 'loading'

  if (compact) {
    if (loading) return null
    if (!session) {
      return (
        <Button href={loginHref(loginCallbackUrl)} onClick={onNavigate} icon="login" fullWidth>
          התחבר
        </Button>
      )
    }
    return (
      <div className="-mx-3">
        <AccountMenuItems
          user={session.user}
          unreadMessages={unreadMessages}
          signOutCallbackUrl={signOutCallbackUrl}
          onNavigate={onNavigate}
        />
      </div>
    )
  }

  return (
    <div
      className="flex w-(--account-slot-width) shrink-0 items-center"
      data-account-slot=""
      data-state={loading ? 'loading' : session ? 'user' : 'guest'}
    >
      {loading ? (
        <span
          aria-hidden="true"
          data-account-skeleton=""
          className="h-(--button-height-header) w-full rounded-(--button-radius) bg-surface-container-highest"
        />
      ) : session ? (
        <AccountMenu user={session.user} unreadMessages={unreadMessages} signOutCallbackUrl={signOutCallbackUrl} />
      ) : (
        <Button href={loginHref(loginCallbackUrl)} onClick={onNavigate} size="header" fullWidth>
          התחבר
        </Button>
      )}
    </div>
  )
}
