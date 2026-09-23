'use client'

import { useEffect, useRef } from 'react'
import { MAX_COMPANION_BYTES } from '@/lib/pluginLimits'
import {
  COMPANION_PLATFORM_KEYS,
  companionExtOf,
  companionPlatformExtensions,
  companionPlatformLabel
} from '@/lib/pluginCompanionPlatforms'
import { checkCompanionFile } from '@/lib/pluginCompanionForm'

const INPUT_CLASS =
  'w-full px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10'
const LABEL_CLASS = 'block text-sm font-bold text-on-surface/60 mb-2'
const HINT_CLASS = 'mt-1 text-sm text-on-surface/50'

// שדות התוכנה הנלווית — תוסף שאינו עובד לבדו ומדבר עם תוכנה שרצה על המחשב
// מחוץ לאוצריא. משותף לדף העלאת התוסף ולחלון העריכה.
//
// value / onChange — ערכי הטופס (ראו companionFormFromPublic ב-
//   src/lib/pluginCompanionForm.js, שם גם הוולידציה לפני שליחה).
// file / onFileChange — קובץ המתקין שנבחר (null = לא נבחר).
// existing — המתקין הקיים בייצוג הציבורי (בעריכה), או null.
// removed / onRemovedChange — סימון "הסר בשמירה"; רלוונטי רק כשיש existing.
export default function CompanionFieldset({
  value,
  onChange,
  file,
  onFileChange,
  existing = null,
  removed = false,
  onRemovedChange = null,
  showAlert
}) {
  const fileInputRef = useRef(null)
  const extensions = companionPlatformExtensions(value.platform)
  const set = (patch) => onChange({ ...value, ...patch })

  // קובץ שהוסר מבחוץ (למשל בהחלפת מערכת ההפעלה) — מנקים גם את ה-input עצמו,
  // אחרת הוא ממשיך להציג שם קובץ שכבר לא יישלח.
  useEffect(() => {
    if (!file && fileInputRef.current) fileInputRef.current.value = ''
  }, [file])

  const handleFile = (event) => {
    const input = event.target
    const selected = input.files?.[0]
    if (!selected) return
    const error = checkCompanionFile({ fileName: selected.name, size: selected.size }, value.platform)
    if (error) {
      showAlert('שגיאה', error)
      input.value = ''
      return
    }
    onFileChange(selected)
    onRemovedChange?.(false)
  }

  // מתקין ל-Windows אינו מתקין ל-macOS — קובץ שסיומתו אינה מתאימה עוד מוסר
  // במקום להישלח ולהיפסל בשרת.
  const handlePlatform = (platform) => {
    set({ platform })
    if (file && !companionPlatformExtensions(platform).includes(companionExtOf(file.name))) {
      onFileChange(null)
      showAlert(
        'הקובץ הוסר',
        `${file.name} אינו מתקין של ${companionPlatformLabel(platform)}. יש לבחור קובץ מתאים (${companionPlatformExtensions(platform).join(', ')}).`
      )
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <label className={LABEL_CLASS}>תוכנה נלווית (אופציונלי)</label>
      <p className="text-sm text-on-surface/60">
        למלא רק אם התוסף אינו יכול לעבוד לבדו ומדבר עם תוכנה שרצה על המחשב מחוץ לאוצריא.
        המתקין מועלה כאן ולא בתוך קובץ התוסף: אוצריא מחלצת את החבילה לתיקיית התוסף, ולתוסף
        אין הרשאת הרצה — קובץ הרצה שנארז בפנים נדחה בהעלאה.
      </p>
      <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900">
        האתר מגיש את המתקין להורדה בדף התוסף, ואינו מריץ אותו — דפדפן אינו מריץ קובץ שהורד.
        המשתמש מוריד ומריץ בעצמו, ולכן כדאי שהמתקין יתקין את התוכנה בלי שלבים ידניים נוספים.
        מתקין חדש או מוחלף נבדק ע&quot;י מנהל לפני שהוא מוגש לציבור.
      </div>

      {removed ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-danger-600">התוכנה הנלווית תוסר בשמירה.</span>
          <button type="button" onClick={() => onRemovedChange?.(false)} className="text-primary hover:underline">
            ביטול ההסרה
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>שם התוכנה</label>
              <input
                type="text"
                value={value.name}
                onChange={(e) => set({ name: e.target.value })}
                className={INPUT_CLASS}
                placeholder="לדוגמה: מתאם חברותא"
                maxLength={60}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>גרסת התוכנה (אופציונלי)</label>
              <input
                type="text"
                value={value.version}
                onChange={(e) => set({ version: e.target.value })}
                className={INPUT_CLASS}
                placeholder="6.0.0"
                maxLength={40}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>מערכת הפעלה</label>
              <select
                value={value.platform}
                onChange={(e) => handlePlatform(e.target.value)}
                className={INPUT_CLASS}
              >
                {COMPANION_PLATFORM_KEYS.map((key) => (
                  <option key={key} value={key}>{companionPlatformLabel(key)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>{existing ? 'החלפת קובץ המתקין' : 'קובץ המתקין'}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={extensions.join(',')}
                onChange={handleFile}
                className={INPUT_CLASS}
              />
              <p className={HINT_CLASS}>
                {extensions.join(', ')} · עד {MAX_COMPANION_BYTES / 1024 / 1024}MB
              </p>
            </div>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm text-on-surface/70">
            <input
              type="checkbox"
              checked={value.installsPlugin}
              onChange={(e) => set({ installsPlugin: e.target.checked })}
              className="mt-1"
            />
            <span>
              המתקין מתקין בסופו גם את קובץ התוסף באוצריא. סמנו רק אם זה נכון —
              דף התוסף יציג אז צעד אחד במקום שניים, ומי שיסמן בטעות יישאר בלי תוסף מותקן.
            </span>
          </label>

          {/* זיהוי השירות — מה שמאפשר לאוצריא ולכלים האוף-ליין לדעת אם התוכנה
              כבר מותקנת אצל המשתמש. האתר עצמו אינו יכול לבדוק. */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>מזהה השירות (אופציונלי)</label>
              <input
                type="text"
                value={value.serviceId}
                onChange={(e) => set({ serviceId: e.target.value })}
                className={INPUT_CLASS}
                placeholder="hevruta-bridge"
                dir="ltr"
                maxLength={64}
              />
              <p className={HINT_CLASS}>אותיות אנגליות קטנות, ספרות, נקודות ומקפים. זה השם שהתוכנה מזדהה בו.</p>
            </div>
            <div>
              <label className={LABEL_CLASS}>גרסת שירות מזערית (אופציונלי)</label>
              <input
                type="text"
                value={value.serviceMinVersion}
                onChange={(e) => set({ serviceMinVersion: e.target.value })}
                className={INPUT_CLASS}
                placeholder="1.2.0"
                dir="ltr"
                maxLength={40}
              />
              <p className={HINT_CLASS}>גרסה מספרית. מי שמותקנת אצלו גרסה נמוכה יותר ייחשב כמי שאין לו את התוכנה.</p>
            </div>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm text-on-surface/70">
            <input
              type="checkbox"
              checked={value.hideUnlessInstalled}
              onChange={(e) => set({ hideUnlessInstalled: e.target.checked })}
              className="mt-1"
            />
            <span>
              אל תציגו את התוסף למי שהתוכנה אינה מותקנת אצלו. דורש מזהה שירות.
              הבדיקה נעשית באוצריא ובכלי העדכון האוף-ליין, שיודעים מה מותקן על המחשב —
              לא באתר, שאינו יכול לדעת זאת.
            </span>
          </label>

          {file && <p className="mt-3 text-sm text-success-600">✓ נבחר: {file.name}</p>}
          {existing && !file && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-on-surface/50">מתקין נוכחי: {existing.fileName || '—'}</span>
              {onRemovedChange && (
                <button type="button" onClick={() => onRemovedChange(true)} className="text-danger-600 hover:underline">
                  הסר תוכנה נלווית
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
