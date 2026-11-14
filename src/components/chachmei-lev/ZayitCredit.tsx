import NewWindowHint from '@/components/ui/NewWindowHint'
import Section from '@/components/ui/Section'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { ZAYIT_CREDIT } from '@/lib/chachmei-lev-data'

/**
 * קרדיט זית — שורה שקטה בסוף הדף, באנגלית ומשמאל לימין כמו בתוכנה (lang="en" לקורא המסך).
 * רמז "נפתח בחלון חדש" (sr-only) בעברית — עטוף ב-lang="he", כדי שקורא המסך לא יקרא אותו בקול אנגלי.
 */
export default function ZayitCredit() {
  return (
    <Section spacing="top" container="narrow">
      <p dir="ltr" lang="en" className="mx-auto max-w-measure text-balance text-center text-body-sm text-on-surface-variant">
        {ZAYIT_CREDIT.before}
        <a
          href={ZAYIT_CREDIT.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cx('rounded-control text-primary underline underline-offset-4', FOCUS_RING)}
        >
          {ZAYIT_CREDIT.url}
          <span lang="he" dir="rtl"><NewWindowHint /></span>
        </a>
        {ZAYIT_CREDIT.after}
      </p>
    </Section>
  )
}
