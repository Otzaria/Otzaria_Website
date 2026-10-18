import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import FaqText from './FaqText'
import { faqAnchorId } from './faqContent'

// פתיחה בגובה (CSS בלבד): ::details-content מ-0 ל-auto. interpolate-size מאפשר מעבר אל auto
// בדפדפנים שתומכים; באחרים התוכן פשוט נפתח, בלי תנועה. ב-reduced-motion — בלי מעבר בכלל.
// התוכן נדחף מתחת לשאלה שנלחצה (לא תזוזה לא-צפויה: CLS לא סופר שינוי שנגרם מקלט המשתמש).
const DETAILS_MOTION = cx(
  '[interpolate-size:allow-keywords]',
  'details-content:h-0 details-content:overflow-clip open:details-content:h-auto',
  'details-content:transition-[height,content-visibility] details-content:[transition-behavior:allow-discrete]',
  'details-content:duration-(--motion-duration-standard) details-content:ease-standard',
  'motion-reduce:details-content:transition-none'
)

/**
 * שאלה אחת: details/summary — נגיש בלי JavaScript (מקלדת, קורא מסך: כפתור עם מצב מורחב/מכווץ),
 * והתשובה קיימת ב-DOM גם כשהיא סגורה: חיפוש בדף (Ctrl+F) מוצא אותה ופותח את השאלה.
 * id — העוגן (/faq#faq-7); הפתיחה לפי העוגן ב-FaqList. scroll-mt — מתחת לכותרת הדביקה.
 */
export default function FaqItem({ faq }) {
  return (
    <details
      id={faqAnchorId(faq.id)}
      className={cx('group/faq scroll-mt-[calc(var(--site-header-height)+1rem)]', DETAILS_MOTION)}
    >
      <summary
        className={cx(
          'flex min-h-(--touch-target) cursor-pointer list-none items-center gap-3 px-4 py-4 text-start transition-colors',
          'hover:bg-(--card-bg-hover) sm:px-5 xl:px-6 [&::-webkit-details-marker]:hidden',
          FOCUS_RING_INSET
        )}
      >
        <span className="flex-1 text-title-sm text-on-surface sm:text-title-md">
          <FaqText text={faq.question} />
        </span>
        <AppIcon
          name="expand_more"
          className="shrink-0 text-2xl text-on-surface-variant transition-transform ease-standard group-open/faq:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="whitespace-pre-line px-4 pb-5 text-body-sm text-on-surface-variant sm:px-5 sm:text-body-md xl:px-6">
        <FaqText text={faq.answer} />
      </div>
    </details>
  )
}
