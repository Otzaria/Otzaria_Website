'use client'

import type { DirectInstallState } from '@/components/plugins/useDirectInstall'

interface DirectInstallButtonProps {
  // מזהה התוסף של הכפתור הזה — משמש להשוואה מול installState.pluginId,
  // כדי שרק הכפתור של התוסף שבתהליך התקנה יציג spinner/הצלחה/כישלון
  pluginId: string
  installState: DirectInstallState
  onInstall: () => void
  // מחלקות ה-CSS של הכפתור עצמו — משתנות בין המקומות (כרטיס קטן מול דף
  // פרטים גדול), ולכן הן פרמטר ולא קבועות ברכיב
  className: string
  spinnerClassName?: string
  // דף פרטי התוסף מציג אייקון material-symbols לצד הטקסט בכל מצב;
  // הכרטיס ותוצאות החיפוש לא
  showIcons?: boolean
  idleLabel?: string
}

// כפתור "התקנה ישירה" עם 4 מצבים (ממתין/הצלחה/כישלון/ברירת מחדל) — משותף
// בין כרטיס התוסף (PluginCard), רשימת תוצאות החיפוש ודף פרטי התוסף.
export default function DirectInstallButton({
  pluginId,
  installState,
  onInstall,
  className,
  spinnerClassName = 'w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin',
  showIcons = false,
  idleLabel = 'התקנה ישירה'
}: DirectInstallButtonProps) {
  const isThisPlugin = installState.pluginId === pluginId
  const phase = isThisPlugin ? installState.phase : 'idle'

  return (
    <button
      onClick={onInstall}
      disabled={phase === 'waiting'}
      className={className}
    >
      {phase === 'waiting' ? (
        <>
          <span className={spinnerClassName}></span>
          <span>מתקין...</span>
        </>
      ) : phase === 'success' ? (
        <>
          {showIcons && <span className="material-symbols-outlined">check_circle</span>}
          <span>{installState.updated ? 'עודכן בהצלחה!' : 'הותקן בהצלחה!'}</span>
        </>
      ) : phase === 'failure' ? (
        <>
          {showIcons && <span className="material-symbols-outlined">error</span>}
          <span>ההתקנה נכשלה - לחץ שוב לנסיון נוסף</span>
        </>
      ) : (
        <>
          {showIcons && <span className="material-symbols-outlined">install_desktop</span>}
          <span>{idleLabel}</span>
        </>
      )}
    </button>
  )
}
