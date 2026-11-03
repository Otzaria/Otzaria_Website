'use client'

import Link from 'next/link'
import Tooltip from '@/components/ui/Tooltip'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { getInitial } from '@/lib/avatar-colors'

/**
 * עיגול החשבון בכותרת העורך (האות הראשונה של השם) — קישור ללוח האישי.
 * גוון טונלי מהטוקנים (לא צבע אקראי לפי שם), כדי שיתאים גם לערכות "נייר" ו"ערב" של העורך.
 *
 * @param {{ name?: string, href?: string }} props
 */
export default function EditorAccountButton({ name = '', href = '/library/dashboard' }) {
  const label = name ? `הלוח האישי של ${name}` : 'הלוח האישי'
  return (
    <Tooltip content={label}>
      <Link
        href={href}
        prefetch={false}
        aria-label={label}
        className={cx('inline-flex size-(--touch-target) shrink-0 items-center justify-center rounded-(--radius-pill)', FOCUS_RING)}
      >
        <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-(--radius-pill) bg-secondary-container text-title-sm font-normal text-on-secondary-container">
          {getInitial(name) || '?'}
        </span>
      </Link>
    </Tooltip>
  )
}
