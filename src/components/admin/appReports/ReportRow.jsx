'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import OpenChip from '@/components/admin/list/OpenChip'
import RelativeTime from '@/components/ui/RelativeTime'
import { productLabel, triggerLabel, typeLabel } from '@/lib/adminAppReportsScreen/appReportsTerms'
import IssueBadge from './IssueBadge'

/** סימן קטן ליד הכותרת — אייקון, והסבר בריחוף ולקורא המסך */
function Mark({ icon, text, className }) {
  return (
    <span title={text} className={`inline-flex shrink-0 ${className}`}>
      <AppIcon name={icon} className="text-icon-md" />
      <span className="sr-only">{text}</span>
    </span>
  )
}

export const reportHref = (reportId) => `/library/admin/app-reports/${encodeURIComponent(reportId)}`

/**
 * שורה ברשימת דיווחי התקלות: הכותרת (קישור לעמוד הדיווח) עם סימני "השאיר מייל" / "השיב במייל", ומתחת — מוצר, סוג,
 * מקור, גרסה, מערכת ומתי התקבל; בצד — הכרטיס ב-GitHub ו"פתח" (צ'יפ שקט; הקישור הנגיש הוא הכותרת).
 */
export default function ReportRow({ report: r }) {
  const router = useRouter()
  const href = reportHref(r.reportId)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-auto">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={href} className="truncate text-title-sm text-on-surface underline-offset-2 hover:underline">{r.title}</Link>
          {r.hasEmail && <Mark icon="mail" text="השאיר כתובת מייל" className="text-on-surface-variant" />}
          {r.lastInboundAt && <Mark icon="reply" text="המדווח השיב במייל" className="text-primary" />}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-on-surface-variant">
          <Badge tone="primary">{productLabel(r)}</Badge>
          <span>{typeLabel(r)}</span>
          <span aria-hidden="true">·</span>
          <span>{triggerLabel(r)}</span>
          {r.appVersion && <><span aria-hidden="true">·</span><bdi dir="ltr">{r.appVersion}</bdi></>}
          {r.platform && <><span aria-hidden="true">·</span><bdi dir="ltr">{r.platform}</bdi></>}
          {r.createdAt && <RelativeTime date={r.createdAt} prefix="·" />}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 ms-auto">
        <IssueBadge report={r} />
        <OpenChip decorative label={`פתח את ${r.title}`} onClick={() => router.push(href)} />
      </div>
    </li>
  )
}
