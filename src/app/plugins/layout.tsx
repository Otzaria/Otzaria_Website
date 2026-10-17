import type { ReactNode } from 'react'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

/**
 * העוטף של כל דפי חנות התוספים: הכותרת (עם אזור החשבון) והפוטר יושבים כאן ולא בכל עמוד,
 * כדי שבמעבר בין דפי החנות (/plugins ← /plugins/all ← /plugins/[id]...) הם נשארים על המסך
 * ולא נטענים מחדש — גם בזמן loading.jsx, שמחליף רק את התוכן שבאמצע.
 *
 * Server Component בלי קריאת session: הכותרת קוראת אותו בדפדפן (useSession), כך שהעוטף לא
 * הופך את דפי החנות לדינמיים או תלויי-משתמש (המטמון הציבורי שלהם — next.config.ts).
 */
export default function PluginsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader showAuth />
      {children}
      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
