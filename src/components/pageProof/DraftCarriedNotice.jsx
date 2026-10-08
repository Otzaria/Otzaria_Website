'use client'

import { useState } from 'react'

// העמוד חזר מזיהוי-מחדש (גרסה חדשה), והטיוטה של המתנדב עברה אליו (lib/pageProof/drafts.js —
// cleanupPageDrafts): כמה תיקונים נשמרו, ואילו לא — השורות שלהם נחתכו מחדש או נעלמו, ולכן הם לא
// חלים על העמוד החדש. תיקוני-החיתוך עצמם לא עוברים: העמוד כבר נחתך מחדש.
// carried = {kept, cut, dropped: [תיאור קצר לכל תיקון שלא עבר], held: [{id, page, mine, ocr}]} · onClose — סגירת ההודעה
// held — תיקוני-טקסט שעשיתם בשורה *לפני* שנחתכה וזוהתה מחדש (drafts.carryDraftOps): הם לא הוחלו, כי היו מסתירים את
// הזיהוי החדש. לכל שורה — הנוסח שלכם מול הזיהוי החדש; "השתמשו בנוסח שלי" ← onUseMine(item) (העורך מחיל אותו כתיקון
// רגיל, עם ביטול); בלי בחירה — הזיהוי החדש נשאר.

const SHOW = 6

export default function DraftCarriedNotice({ carried, onClose, onUseMine = null }) {
  const [used, setUsed] = useState(() => new Set())
  if (!carried) return null
  const { kept = 0, cut = 0, dropped = [], update = false } = carried
  const held = Array.isArray(carried.held) ? carried.held : []
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
        {held.length > 0 && (
          <div className="mt-2" data-testid="carried-held">
            <p>
              <b>{held.length === 1 ? 'שורה אחת זוהתה מחדש' : `${held.length} שורות זוהו מחדש`} אחרי שתיקנתם בה טקסט.</b> בעמוד מוצג
              עכשיו הזיהוי החדש (בחיתוך המתוקן הוא רואה את כל השורה). אם הנוסח שלכם הוא הנכון — בחרו בו; אחרת אין צורך לעשות דבר.
            </p>
            <ul className="mt-1 space-y-1">
              {held.map((h) => (
                <li key={h.id} className="rounded-lg bg-surface/70 px-2 py-1">
                  <div>
                    <span className="text-on-surface/70">הזיהוי החדש: </span>«{h.ocr}»
                  </div>
                  <div>
                    <span className="text-on-surface/70">הנוסח שלכם: </span>«{h.mine}»
                  </div>
                  {onUseMine &&
                    (used.has(h.id) ? (
                      <span className="text-xs text-success-800">✓ הנוסח שלכם הוחל (Ctrl+Z מבטל)</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (onUseMine(h) !== false) setUsed((s) => new Set([...s, h.id]))
                        }}
                        className="mt-0.5 rounded-md bg-info-100 px-2 py-0.5 text-xs text-info-900 hover:bg-info-200"
                      >
                        השתמשו בנוסח שלי
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="סגירת ההודעה" className="rounded-full p-1 text-info-800 hover:bg-info-100">
        <span aria-hidden="true" className="material-symbols-outlined block text-base">close</span>
      </button>
    </div>
  )
}
