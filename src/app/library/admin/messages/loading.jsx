import { MessagesLoadingSkeleton } from '@/components/admin/messages/MessagesSkeleton'

// במעבר מהסרגל אין כאן את הכתובת (?view=) ולא את התפקיד — לכן שלד ניטרלי: הכותרת ומשטח, בלי לשוניות ובלי שורות
// שעלולות להתחלף באשף התזכורות או לאבד לשונית. השלד המדויק (לפי הלשונית והתפקיד) — ב-Suspense של page.jsx.
export default function Loading() {
  return <MessagesLoadingSkeleton />
}
