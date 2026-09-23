'use client'

import { useSyncExternalStore } from 'react'
import DirectInstallButton from '@/components/plugins/DirectInstallButton'
import type { DirectInstallState } from '@/components/plugins/useDirectInstall'
import type { PluginCompanion } from '@/components/plugins/types'
import { formatFileSize } from '@/lib/formatFileSize'
import { detectViewerPlatform } from '@/lib/pluginCompanionPlatforms'

type ViewerPlatform = 'windows' | 'linux' | 'macos' | 'other'

// ה-user agent אינו משתנה בזמן שהדף פתוח — אין למה להירשם
const subscribeNever = () => () => {}

interface CompanionInstallCardProps {
  companion: PluginCompanion
  pluginId: string
  // התוסף תומך בהתקנה ישירה (קובץ .otzplugin) — אז הצעד השני הוא כפתור
  canDirectInstall: boolean
  installState: DirectInstallState
  onDirectInstall: () => void
}

// כרטיס "התוסף דורש תוכנה נלווית" בדף התוסף. התוסף אינו עובד בלעדיה, ולכן זה
// כרטיס ולא שורת מידע, וההתקנה כולה נעשית מתוכו לפי הסדר: קודם התוכנה, אחר כך
// התוסף (או צעד אחד, כשהמתקין מתקין גם את התוסף).
export default function CompanionInstallCard({
  companion,
  pluginId,
  canDirectInstall,
  installState,
  onDirectInstall
}: CompanionInstallCardProps) {
  // navigator אינו קיים בשרת — שם null, ובדפדפן הערך האמיתי (אחרי ה-hydration)
  const viewerPlatform = useSyncExternalStore(
    subscribeNever,
    () => detectViewerPlatform(navigator.userAgent) as ViewerPlatform,
    () => null
  )

  return (
    <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-warning-900">desktop_windows</span>
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-warning-900">התוסף דורש תוכנה נלווית</h3>
            <p className="mt-1 text-sm leading-relaxed text-warning-900/80">
              התוסף מדבר עם תוכנה שרצה על המחשב מחוץ לאוצריא, ואינו עובד בלעדיה.
              יש להוריד את המתקין ולהריץ אותו — האתר אינו מריץ קבצים במחשב שלכם.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white px-3 py-1 font-bold text-warning-900">{companion.name}</span>
            {companion.version && (
              <span className="rounded-full bg-white/60 px-3 py-1 text-warning-900/80">גרסה {companion.version}</span>
            )}
            {companion.platformLabel && (
              <span className="rounded-full bg-white/60 px-3 py-1 text-warning-900/80">{companion.platformLabel}</span>
            )}
            {companion.size > 0 && (
              <span className="rounded-full bg-white/60 px-3 py-1 text-warning-900/80">{formatFileSize(companion.size)}</span>
            )}
          </div>

          {/* גלישה ממערכת אחרת אינה שגיאה — מתקינים על המחשב, גם אם מעיינים
              בחנות מהטלפון. לכן הערה ולא אזהרה. */}
          {viewerPlatform && companion.platform && viewerPlatform !== companion.platform && (
            <p className="text-sm text-warning-900/80">
              המתקין הוא ל-{companion.platformLabel}, ואתם גולשים כרגע ממערכת אחרת.
              יש להוריד ולהריץ אותו במחשב שאוצריא מותקנת בו.
            </p>
          )}

          <ol className="space-y-3">
            <li className="flex flex-wrap items-center gap-3">
              <StepNumber n={1} primary />
              <a
                href={companion.downloadUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-warning-900 px-6 py-3 font-bold text-white transition-colors hover:bg-warning-900/90"
              >
                <span className="material-symbols-outlined">download</span>
                <span>הורדת התוכנה והתקנתה</span>
              </a>
              {companion.fileName && <span className="text-sm text-warning-900/70">{companion.fileName}</span>}
            </li>
            <li className="flex flex-wrap items-center gap-3">
              <StepNumber n={2} />
              {companion.installsPlugin ? (
                <span className="text-sm text-warning-900/80">
                  אין צעד שני — המתקין מתקין בסופו גם את התוסף עצמו באוצריא.
                </span>
              ) : canDirectInstall ? (
                <DirectInstallButton
                  pluginId={pluginId}
                  installState={installState}
                  onInstall={onDirectInstall}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-primary text-primary rounded-xl font-bold hover:bg-primary/5 transition-colors disabled:cursor-default disabled:opacity-80"
                  spinnerClassName="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"
                  showIcons
                  idleLabel="התקנה ישירה לאוצריא"
                />
              ) : (
                <span className="text-sm text-warning-900/80">הורדת קובץ התוסף (הכפתור למעלה) והתקנתו באוצריא.</span>
              )}
            </li>
          </ol>

          {/* תוסף שהצהיר שאין להציגו בלי התוכנה — באוצריא ובכלי העדכון
              האוף-ליין הוא פשוט לא יופיע. באתר אי אפשר לבדוק מה מותקן, ולכן
              אומרים את זה במפורש. */}
          {companion.service?.hideUnlessInstalled && (
            <p className="text-sm text-warning-900/80">
              באוצריא ובכלי העדכון האוף-ליין התוסף מוצג רק למי שהתוכנה הזאת כבר מותקנת אצלו
              {companion.service.minVersion ? `, בגרסה ${companion.service.minVersion} ומעלה` : ''}.
            </p>
          )}

          {companion.sha256 && (
            <p className="break-all font-mono text-[11px] leading-relaxed text-warning-900/60">
              SHA-256: {companion.sha256}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function StepNumber({ n, primary = false }: { n: number; primary?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        primary ? 'bg-warning-900 text-white' : 'bg-warning-900/15 text-warning-900'
      }`}
    >
      {n}
    </span>
  )
}
