'use client'

import Badge from '@/components/ui/Badge'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import { cx } from '@/components/ui/cx'
import { uploadItemLabel } from '@/lib/adminUploads/uploadGroups'
import { bookStatusView } from '@/lib/adminUploads/uploadTerms'
import PrimaryActionButton from './PrimaryActionButton'
import RelativeTime from '@/components/ui/RelativeTime'
import { itemMenuItems, itemPrimaryAction } from './uploadRowActions'
import { AREA_BOOK, AREA_CHECK, AREA_CONTROLS, AREA_MENU, AREA_PRIMARY, AREA_STATUS, ROW_GRID, ROW_PADDING, TRASH_ROW_GRID } from './uploadRowLayout'

/**
 * קובץ אחד בתוך ספר פתוח: "עמוד 83" (או שם הקובץ), ממי ומתי, "הורד קובץ" / "שחזר", ו-⋮.
 * אותן עמודות ואותו ריפוד כמו שורת הספר — הפעולות מיושרות מתחת לפעולות הספר, והשם מתחת לשם
 * הספר. מצב הספר שייך לספר כולו, ולכן כאן הוא רק מוצג, וגם זה רק כשבספר
 * יש כמה מצבים (showStatus). busy — יש בקשה פתוחה על הקובץ.
 */
export default function UploadItemRow({ upload, group, variant, selected, onSelect, showStatus, statusOptions, permissions, actions, busy = false }) {
  const label = uploadItemLabel(upload)
  const primary = itemPrimaryAction({ upload, group, variant, actions })
  const menuItems = itemMenuItems({ upload, group, variant, permissions, actions })
  const status = showStatus ? bookStatusView(upload.bookStatus, Object.fromEntries(statusOptions.map((o) => [o.value, o]))) : null

  return (
    <li data-item={upload.id} className={cx(selected && 'bg-surface-selected')}>
      <div className={cx(variant === 'trash' ? TRASH_ROW_GRID : ROW_GRID, ROW_PADDING)}>
        <div className={AREA_CHECK}>
          <Checkbox label={`בחר את ${label} של ${group.title}`} checked={selected} onChange={(checked) => onSelect([upload.id], checked)} />
        </div>
        <div className={AREA_BOOK}>
          <p className="break-words text-body-md text-on-surface">{label}</p>
          <div className="flex flex-wrap items-center gap-x-2 text-body-sm text-on-surface-variant">
            <span>{upload.uploadedBy || 'אורח'}</span>
            <span aria-hidden="true">·</span>
            {variant === 'trash' ? <RelativeTime date={upload.deletedAt} prefix="נמחק" /> : <RelativeTime date={upload.uploadedAt} />}
            {upload.originalFileName && label !== upload.originalFileName && (
              <>
                <span aria-hidden="true">·</span>
                <bdi dir="ltr" className="inline-block max-w-full truncate align-bottom @2xl:max-w-2xs" title={upload.originalFileName}>{upload.originalFileName}</bdi>
              </>
            )}
          </div>
        </div>
        <div className={AREA_CONTROLS}>
          {variant === 'uploads' && (
            <div className={AREA_STATUS}>
              {status && <Badge>{status.label}</Badge>}
            </div>
          )}
          <div className={AREA_PRIMARY}>
            <PrimaryActionButton action={primary} disabled={busy} />
          </div>
        </div>
        <div className={AREA_MENU}>
          <MenuButton label={`פעולות נוספות: ${label}`} items={busy ? menuItems.map((i) => (i.separator ? i : { ...i, disabled: true })) : menuItems} />
        </div>
      </div>
    </li>
  )
}
