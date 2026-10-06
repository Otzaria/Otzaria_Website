'use client'

// העמוד חזר מזיהוי-מחדש (גרסה חדשה), והטיוטה של המתנדב עברה אליו (lib/pageProof/drafts.js —
// cleanupPageDrafts): כמה תיקונים נשמרו, ואילו לא — השורות שלהם נחתכו מחדש או נעלמו, ולכן הם לא
// חלים על העמוד החדש. תיקוני-החיתוך עצמם לא עוברים: העמוד כבר נחתך מחדש.
// carried = {kept, cut, dropped: [תיאור קצר לכל תיקון שלא עבר]} · onClose — סגירת ההודעה

const SHOW = 6

export default function DraftCarriedNotice({ carried, onClose }) {
  if (!carried) return null
  const { kept = 0, cut = 0, dropped = [], update = false } = carried
  return (
    <div
      role="status"
      aria-label="הטיוטה עברה לגרסה החדשה של העמוד"
      className="flex items-start gap-2 rounded-xl border border-info-200 bg-info-50 px-4 py-3 text-sm text-info-900"
    >
      <span aria-hidden="true" className="material-symbols-outlined">history</span>
      <div className="flex-1">
        <p>
          <b>{update ? 'העמוד עודכן מתוכנת-הספר, והטיוטה עברה אליו:' : 'העמוד חזר מזיהוי-מחדש, והטיוטה שלכם עברה אליו:'}</b>{' '}
          {kept > 0 ? (kept === 1 ? 'תיקון אחד נשמר.' : `${kept} תיקונים נשמרו.`) : 'אף תיקון לא נשמר.'}
          {cut > 0 && ` ${cut === 1 ? 'תיקון-החיתוך לא הועבר' : `${cut} תיקוני-החיתוך לא הועברו`} — העמוד נחתך מחדש; בדקו את החיתוך החדש.`}
        </p>
        {dropped.length > 0 && (
          <>
            <p className="mt-1">
              {dropped.length === 1
                ? 'תיקון אחד לא חל על השורות החדשות ולא נשמר — עשו אותו שוב אם צריך:'
                : `${dropped.length} תיקונים לא חלים על השורות החדשות ולא נשמרו — עשו אותם שוב אם צריך:`}
            </p>
            <ul className="mt-1 list-disc pr-5">
              {dropped.slice(0, SHOW).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
              {dropped.length > SHOW && <li>ועוד {dropped.length - SHOW}</li>}
            </ul>
          </>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="סגירת ההודעה" className="rounded-full p-1 text-info-800 hover:bg-info-100">
        <span aria-hidden="true" className="material-symbols-outlined block text-base">close</span>
      </button>
    </div>
  )
}
