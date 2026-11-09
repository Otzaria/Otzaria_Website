import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import NewWindowHint from '@/components/ui/NewWindowHint'
import { cx } from '@/components/ui/cx'
import { isLinkable } from '@/lib/chachmei-lev-data'
import SourceLogo from './SourceLogo'

export type BookSource = {
  name: string
  url?: string
  logo?: string
  ratio?: number
  originalColor?: boolean
  logoAsText?: boolean
}

/** יש לוגו שאפשר להציג כמסכה חד-צבעית (logoAsText — קובץ שנראה כמלבן/כתם כשהוא נצבע בצבע אחד) */
function hasMaskLogo(source: BookSource): source is BookSource & { logo: string; ratio: number } {
  return Boolean(source.logo && source.ratio && !source.logoAsText)
}

/**
 * כרטיס מקור ספרים: לוגו חד-צבעי ושם. מקור בלי לוגו שמיש — השם בלבד, באותו סגנון, באמצע הכרטיס.
 * עם קישור — כל הכרטיס קישור חיצוני והלוגו ב-primary; בלי קישור — כרטיס סטטי, והלוגו בצבע השקט
 * (כמו בתוכנה). size="lg" — המקורות הראשיים; md — קיר הלוגואים.
 */
export default function SourceCard({ source, size = 'md' }: { source: BookSource; size?: 'md' | 'lg' }) {
  const linked = isLinkable(source.url)
  const lg = size === 'lg'
  const body = (
    <>
      {hasMaskLogo(source) && (
        <span className={cx('flex w-full items-center justify-center', linked ? 'text-primary' : 'text-on-surface-variant')}>
          <SourceLogo src={source.logo} ratio={source.ratio} size={size} />
        </span>
      )}
      <span
        className={cx(
          'flex items-center justify-center gap-1 text-balance text-center text-on-surface',
          lg ? 'text-title-md' : 'text-title-sm'
        )}
      >
        {source.name}
        {linked && (
          <>
            <NewWindowHint />
            <AppIcon name="open_in_new" className="shrink-0 text-sm text-on-surface-variant" />
          </>
        )}
      </span>
    </>
  )
  const padding = lg ? 'lg' : 'md'
  const layout = cx('flex w-full flex-col items-center justify-center', lg ? 'gap-4' : 'gap-3')
  return (
    <li className="flex">
      {linked
        ? <Card href={source.url as string} external padding={padding} className={layout}>{body}</Card>
        : <Card padding={padding} className={layout}>{body}</Card>}
    </li>
  )
}
