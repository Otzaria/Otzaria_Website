import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
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
}

/**
 * כרטיס מקור ספרים: לוגו (או אריח אייקון כשאין לוגו) ושם. עם קישור — כל הכרטיס קישור חיצוני;
 * בלי קישור — כרטיס סטטי, והלוגו בצבע השקט (כמו בתוכנה). size="lg" — המקורות הראשיים.
 */
export default function SourceCard({ source, size = 'md' }: { source: BookSource; size?: 'md' | 'lg' }) {
  const linked = isLinkable(source.url)
  const body = (
    <>
      <span className={cx('flex w-full items-center justify-center', size === 'lg' ? 'h-20' : 'h-14', linked ? 'text-primary' : 'text-on-surface-variant')}>
        {source.logo && source.ratio
          ? <SourceLogo src={source.logo} ratio={source.ratio} originalColor={source.originalColor} size={size} />
          : <IconTile icon="library_books" size={size === 'lg' ? 'lg' : 'md'} />}
      </span>
      <span className={cx('flex items-center justify-center gap-1 text-center text-on-surface', size === 'lg' ? 'text-title-md' : 'text-title-sm')}>
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
  const layout = cx('flex w-full flex-col items-center justify-center', size === 'lg' ? 'gap-4' : 'gap-3')
  return (
    <li className="flex">
      {linked
        ? <Card href={source.url as string} external padding={size === 'lg' ? 'lg' : 'md'} className={layout}>{body}</Card>
        : <Card padding={size === 'lg' ? 'lg' : 'md'} className={layout}>{body}</Card>}
    </li>
  )
}
