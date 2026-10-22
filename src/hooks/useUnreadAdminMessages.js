'use client'

import { useEffect, useState } from 'react'
import { hasAnyAdminAccess } from '@/lib/roles'
import { apiGet } from '@/lib/api-utils'

const POLL_INTERVAL_MS = 60000

/**
 * מונה ההודעות שלא נקראו בתור הניהול — לנקודה בכפתור החשבון ולמונה ליד "ניהול" בתפריט.
 * משותף לכותרת הספרייה (Header) ולכותרת האתר בחנות התוספים (OtzariaSoftwareHeader showAuth),
 * כדי שהמונה ייראה ויתנהג אותו דבר בכל מקום.
 *
 * נמשך בדפדפן בלבד, לכל משתמש בנפרד — אף פעם לא בשרת — כך שדפי החנות נשארים זהים לכל
 * המבקרים וניתנים למטמון ציבורי (next.config.ts).
 *
 * role — התפקיד של המשתמש המחובר (או undefined: אורח / כותרת בלי אזור חשבון). רק תפקידי ניהול
 *   שואלים את השרת — אותה הרשאה כמו ב-/api/messages/unread-count (hasAnyAdminAccess), אחרת
 *   הבקשה תחזור 403.
 * לשונית ברקע לא שואלת את השרת; בחזרה אליה מרעננים מיד.
 */
export function useUnreadAdminMessages(role) {
  const [unreadMessages, setUnreadMessages] = useState(0)
  const isAdminRole = hasAnyAdminAccess(role)

  useEffect(() => {
    if (!isAdminRole) return undefined
    const loadUnreadCount = async () => {
      try {
        // מונה בלבד — בעבר נמשך כאן כל תור ההודעות (/api/messages?allMessages=true,
        // מאות KB עד MB) בכל דף ובכל דקה, רק כדי לספור את ה-unread בדפדפן.
        const result = await apiGet('/api/messages/unread-count')
        if (result.success) {
          setUnreadMessages(result.count)
        }
      } catch (error) {
        console.error('Error loading messages:', error)
      }
    }
    const poll = () => { if (!document.hidden) loadUnreadCount() }
    loadUnreadCount()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [isAdminRole])

  // המונה נגזר מהתפקיד הנוכחי: אחרי התנתקות/החלפת משתמש לא נשאר מספר ישן של מנהל קודם
  return isAdminRole ? unreadMessages : 0
}
