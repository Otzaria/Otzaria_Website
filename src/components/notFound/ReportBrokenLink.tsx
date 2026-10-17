import AppIcon from '@/components/ui/AppIcon'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { cx } from '@/components/ui/cx'
import { CONTACT_EMAIL, brokenLinkMailto } from './notFoundLinkData'

/**
 * שורת דיווח על קישור שבור — דרך כתובת הדואר הקיימת של האתר (זו שבדף הפרטיות), עם נושא מוכן.
 * אין באתר טופס יצירת קשר, ולכן mailto ולא טופס. הכתובת מוצגת גם כטקסט — למי שאין לו
 * תוכנת דואר מוגדרת, והלחיצה לא תפתח דבר.
 */
export default function ReportBrokenLink({ className }: { className?: string }) {
  return (
    <p className={cx('text-center text-sm text-on-surface-variant', className)}>
      הגעת לכאן מקישור באתר?{' '}
      <a
        href={brokenLinkMailto()}
        className={cx(
          'inline-flex items-center gap-1 rounded-control py-2 font-semibold text-primary underline underline-offset-4 hover:text-primary-hover',
          FOCUS_RING
        )}
      >
        <AppIcon name="mail" className="text-base no-underline" />
        כתוב לנו בדוא״ל על הקישור השבור
      </a>
      <span className="block">
        <bdi dir="ltr">{CONTACT_EMAIL}</bdi>
      </span>
    </p>
  )
}
