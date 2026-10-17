'use client'

import { useSyncExternalStore } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Ltr from '@/components/ui/Ltr'
import NewWindowHint from '@/components/ui/NewWindowHint'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { readDocumentOs } from '@/lib/detectOs'
import OfflinePlatformCard from './OfflinePlatformCard'
import { formatReleaseDate, formatSize, OFFLINE_PLATFORM_KEYS, otherPlatform, resolveShownPlatform } from './offlinePlatforms'

// מונחים לועזיים בבידוד (bdi) — אחרת "10 / 11" והסוגריים מתהפכים בשורה עברית
const PLATFORMS = {
  windows: {
    icon: 'desktop_windows',
    title: 'Windows',
    question: 'Windows',
    requirement: <><Ltr>Windows 10 / 11</Ltr> (64 סיביות)</>,
    kind: 'קובץ אחד, בלי התקנה'
  },
  macos: {
    icon: 'laptop_mac',
    title: 'macOS',
    question: 'Mac',
    requirement: <><Ltr>macOS 10.15</Ltr> ומעלה</>,
    kind: <>קובץ <Ltr>zip</Ltr></>
  }
}

// מה מוצג בציור הראשון — CSS בלבד, לפי <html data-os> שהסקריפט ב-layout כותב לפני הציור
// (lib/detectOs.js): macOS רק כשזוהה Mac, ו-Windows בכל מקרה אחר (כולל טלפון, Linux ולא ידוע).
// כך אין קפיצה אחרי ה-hydration, והדף זהה לכל המבקרים (מטמון CDN ציבורי). חייב להתאים ל-
// resolveShownPlatform (offlinePlatforms.js), שקובע את התג "המחשב שלך".
const SHOWN_WHEN = {
  windows: 'flex in-data-[os=macos]:hidden',
  macos: 'hidden in-data-[os=macos]:flex'
}

// הערה לפני הכרטיס כשהמערכת לא נתמכת (טלפון / Linux וכו'). shownClass מלא ולא מורכב — כדי
// ש-Tailwind ימצא אותו בסריקה.
const UNSUPPORTED_OS_NOTES = [
  {
    os: 'mobile',
    shownClass: 'in-data-[os=mobile]:flex',
    icon: 'smartphone',
    text: <>הכלי הזה מיועד למחשב (<Ltr>Windows</Ltr> או <Ltr>macOS</Ltr>). בטלפון ובטאבלט, אוצריא מתעדכנת דרך חנות האפליקציות.</>
  },
  {
    os: 'other',
    shownClass: 'in-data-[os=other]:flex',
    icon: 'info',
    text: <>הכלי זמין ל-<Ltr>Windows</Ltr> ול-<Ltr>macOS</Ltr>. אפשר להוריד אותו כאן ולהפעיל אותו במחשב אחר עם אחת מהמערכות האלה.</>
  }
]

// ה-data-os לא משתנה אחרי הטעינה — אין למה להירשם
const subscribe = () => () => {}
const getOs = () => readDocumentOs(document)
const getServerOs = () => null

/**
 * אזור ההורדה של "עדכוני אוצריא" — releases מגיע כבר טעון מהשרת (OfflineUpdateDownload.jsx,
 * ה-Server Component שעוטף את הרכיב הזה). כש-releases הוא null (השליפה נכשלה) כל כרטיס מוביל
 * לדף הגרסאות. מוצג כרטיס אחד: של המערכת שזוהתה, או Windows (בלי התג "המחשב שלך") כשלא זוהתה
 * מערכת שהכלי זמין לה. מתחתיו קישור משני קטן להורדה למערכת השנייה ("יש לך Mac?"), כדי שמי
 * שהזיהוי טעה אצלו לא ייתקע. שני הכרטיסים נמצאים ב-HTML, ו-CSS מסתיר את זה שלא מתאים.
 */
export default function OfflineUpdateDownloadClient({ repoUrl, releases }) {
  // בשרת וב-hydration — null (כמו ה-HTML); מיד אחריו — הערך מ-<html data-os>. רק התג וה-aria
  // תלויים בו, ושניהם לא משנים גובה
  const os = useSyncExternalStore(subscribe, getOs, getServerOs)
  const shown = resolveShownPlatform(os)
  const releasesPage = releases?.releaseUrl || `${repoUrl}/releases/latest`
  const date = formatReleaseDate(releases?.publishedAt)
  const hrefFor = (key) => releases?.[key]?.url || releasesPage

  return (
    <div className="flex flex-col gap-5">
      {/* הערה לפני הכרטיס, כשהמערכת לא נתמכת: בטלפון — שהכלי למחשב; ב-Linux וכו' — לאילו
          מערכות הוא זמין. ב-CSS לפי data-os (לפני הציור הראשון), ולכן היא לא דוחפת דבר אחרי הטעינה */}
      {UNSUPPORTED_OS_NOTES.map((note) => (
        <Card key={note.os} tone="tonal" role="note" padding="sm" className={`hidden items-start gap-3 text-body-sm text-on-surface ${note.shownClass}`}>
          <AppIcon name={note.icon} className="mt-0.5 shrink-0 text-xl text-on-tile" />
          <p>{note.text}</p>
        </Card>
      ))}

      {OFFLINE_PLATFORM_KEYS.map((key) => {
        const platform = PLATFORMS[key]
        const other = PLATFORMS[otherPlatform(key)]
        const size = formatSize(releases?.[key]?.size)
        return (
          <div key={key} data-offline-platform={key} className={`${SHOWN_WHEN[key]} mx-auto w-full max-w-md flex-col gap-3`}>
            <OfflinePlatformCard
              href={hrefFor(key)}
              icon={platform.icon}
              title={platform.title}
              details={[platform.requirement, size ? <>{platform.kind} · <Ltr>{size}</Ltr></> : platform.kind]}
              actionLabel={`הורד ל-${platform.title}`}
              idPrefix={`offline-download-${key}`}
              matched={key === shown.key && shown.matched}
            />
            <p className="text-center text-body-sm text-on-surface-variant">
              יש לך <bdi dir="ltr">{other.question}</bdi>?{' '}
              <a
                href={hrefFor(otherPlatform(key))}
                className={`inline-block rounded-control py-1 underline underline-offset-4 hover:text-on-surface ${FOCUS_RING}`}
              >
                להורדה ל-<bdi dir="ltr">{other.title}</bdi>
              </a>
            </p>
          </div>
        )
      })}

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="flex max-w-measure items-start gap-2 text-body-sm text-on-surface-variant">
          <AppIcon name="usb" className="mt-0.5 shrink-0 text-xl text-on-tile" />
          <span>שמור את הקובץ ישר על כונן USB. אותו כונן ישמש אותך בשני המחשבים.</span>
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-body-sm text-on-surface-variant">
          {releases?.version ? (
            <>
              <Badge>גרסה <Ltr>{releases.version}</Ltr></Badge>
              {date && <span>פורסמה ב-{date}</span>}
            </>
          ) : (
            <span>לא הצלחנו לטעון את פרטי הגרסה. אפשר להוריד את הכלי מדף כל הגרסאות.</span>
          )}
          <Button href={`${repoUrl}/releases`} external variant="text" size="sm" iconEnd="open_in_new">
            כל הגרסאות<NewWindowHint destination="ב-GitHub" />
          </Button>
        </p>
      </div>
    </div>
  )
}
