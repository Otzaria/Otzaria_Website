'use client'

import { usePathname } from 'next/navigation'
import TabLinks from '@/components/ui/TabLinks'
import { activeCorrectionsTab } from '@/lib/corrections/tabs'

/**
 * הלשוניות "דיווחים" / "הגדרות". הרשימה עצמה נקבעת בשרת (layout) לפי ה-session,
 * כך ששתי הלשוניות כבר ב-HTML — קודם השנייה הופיעה רק אחרי טעינת ה-session וגרמה לקפיצה.
 * כאן רק סימון הלשונית הפעילה לפי הכתובת.
 */
export default function CorrectionsTabs({ tabs, className }) {
  const pathname = usePathname()
  return <TabLinks label="דיווחי טעויות" items={tabs} activeId={activeCorrectionsTab(pathname)} className={className} />
}
