'use client'

import { useState } from 'react'
import Link from 'next/link'

// Link שמבצע prefetch רק כשהמשתמש מראה כוונה (ריחוף, פוקוס מקלדת או נגיעה),
// ולא ברגע שהקישור נכנס לתצוגה. זה הדפוס המתועד של Next ("Hover-triggered
// prefetch", node_modules/next/dist/docs/01-app/02-guides/prefetching.md):
// prefetch={false} עד לכוונה, ואז null — התנהגות ברירת המחדל.
//
// מתאים לשורת ניווט עם הרבה קישורים שמוצגת בכל עמוד: ברירת המחדל מורידה את
// ה-RSC ואת חבילות ה-JavaScript של *כל* היעדים מיד בטעינה. ב-AdminNav זה היה
// 73 בקשות RSC ועוד כ-210KB JavaScript בכל עמוד ניהול.
/** @param {Record<string, any>} props — כל ה-props של next/link */
export default function IntentPrefetchLink({ onMouseEnter, onFocus, onTouchStart, ...props }) {
  const [intent, setIntent] = useState(false)
  const activate = () => { if (!intent) setIntent(true) }

  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(e) => { activate(); onMouseEnter?.(e) }}
      onFocus={(e) => { activate(); onFocus?.(e) }}
      onTouchStart={(e) => { activate(); onTouchStart?.(e) }}
    />
  )
}
