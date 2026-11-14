import { safeHref } from '@/components/ui/Button'

/** הפרטים שהמעלה מילא בהעלאת ספר שלם — אותם שדות ואותו סדר כמו ב-MetadataDisplay הישן */
export function uploadMetadataItems(upload) {
  if (!upload || upload.uploadType !== 'full_book') return []
  const items = []
  const add = (label, value) => { if (value !== undefined && value !== null && value !== '') items.push({ label, value }) }
  add('מחבר', upload.authorName)
  add('קטגוריית ספר', upload.bookCategory)
  add('קטגוריית מחבר', upload.authorCategory)
  add('שנת המחבר', upload.authorYear)
  add('שנת הדפסה', upload.publicationYear)
  add('בעל הזכויות', upload.copyrightHolder)
  if (upload.sourceUrl) add('מקור', { url: upload.sourceUrl })
  if (upload.isOcr) add('זיהוי טקסט אוטומטי', upload.ocrDescription || 'כן')
  if (typeof upload.allowOtherPlatforms === 'boolean') add('אישור לזית ולפלטפורמות נוספות', upload.allowOtherPlatforms ? 'כן' : 'לא')
  return items
}

/**
 * פרטי ספר שלם (מחבר, קטגוריה, מקור...) — רשימת הגדרות קומפקטית בתוך ספר פתוח.
 * @param {{ upload: any }} props
 */
export default function UploadMetadata({ upload }) {
  const items = uploadMetadataItems(upload)
  if (items.length === 0) return null
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-body-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
      {items.map(({ label, value }) => (
        <div key={label} className="contents">
          <dt className="text-on-surface-variant">{label}</dt>
          <dd className="mb-1.5 min-w-0 break-words text-on-surface sm:mb-0">
            {typeof value !== 'object' ? value : safeHref(value.url) && /^https?:/i.test(value.url)
              ? <a href={value.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2"><bdi dir="ltr" className="break-all">{value.url}</bdi></a>
              : <bdi dir="ltr" className="break-all">{value.url}</bdi>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
