'use client'

import { FRAME_OBJECT_KINDS, isFurnitureStream } from '@/lib/pageProof/vocab'
import { isObjectFrame, FURNITURE_CHOICE, NOTES_RUNHEAD_CHOICE, choiceInfo } from '@/lib/pageProof/scanGeometry'

// חלונית קטנה ליד מסגרת נבחרת בסריקה: הזרם שלה (כולל כותרת של כל זרם ו"ריהוט הדף"),
// המספר שלה בזרם, מקומה בסדר-הקריאה של העמוד, סוג (טקסט / טבלה / איור / לוח) ומחיקה.
// הרכיב מציג בלבד — כל שינוי חוזר דרך on*; ScanPanel הופך אותו לפעולות (frames_set /
// frame_seq), ו-ProofScan ממקם את החלונית מחוץ למסגרת (שלא תסתיר את הקווים והידיות).
// role="group" ולא "dialog": החלונית אינה חלון מודאלי, והעורך מדלג על קיצורי-המקלדת שלו
// (Ctrl+Z / Ctrl+Y) בתוך חלונות — אחרי לחיצה כאן הביטול היה מפסיק לעבוד.
//
// Props:
//   frame        {fid, stream, bbox, order, kind?}
//   seq          המספר בזרם (null למסגרת-אובייקט); seqCount — כמה מסגרות בזרם הזה
//   orderIndex   המקום בסדר-הקריאה (0..orderCount-1)
//   chips        streamChips(): {content, headings, furniture, more, moreHeadings}; כל פריט {key, he, color}
//   suggested    המסגרות הן הצעת המחשב (שינוי כאן שומר את כולן)
//   style, className  תוספות-עיצוב (המיקום — מ-ProofScan)
//   onStream(key) — key: זרם, זרם-כותרת (…_heading), FURNITURE_CHOICE ("ריהוט הדף") או
//                   NOTES_RUNHEAD_CHOICE ("כותרת-רצה של ההערות" — נשמר כ"כותרת עמוד")
//   onSeq(n) · onOrder(-1|1) · onKind(kind|null) · onDelete() · onClose() — סגירת החלונית (המסגרת נשארת בחורה)
//   onClaimLine (רשות) — השורה שבסמן בולטת מהמסגרת הזו: "השורה שייכת למסגרת הזו" (claimTitle — ההסבר)
//   extra (רשות) — ReactNode של דף עוטף (תוכנת-הספר: שרשור לעמוד אחר וכו'), בשורה משלו בתחתית

const small = 'flex h-6 min-w-6 items-center justify-center rounded border border-surface-variant bg-white px-1.5 text-[11px] hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-white'

const EMPTY_CHIPS = { content: [], headings: [], furniture: [], more: [], moreHeadings: [] }
const FURNITURE_TITLE = 'כותרת-רצה (גם של ההערות), מספר עמוד, שומר-דף — אינם נכנסים לספר'
const NOTES_RUNHEAD_TITLE = 'כותרת שחוזרת בכל עמוד מעל ההערות (שם החיבור שבהערות) — ריהוט, לא נכנסת לספר. כותרת של פרק או סעיף בתוך ההערות — סגנון-הפסקה «כותרת» בטקסט, לא מסגרת'
// מסגרת-כותרת (…_heading) — כבר לא בבחירה (בעל הפרויקט, 2026-10-05: כותרת היא סגנון-פסקה, לא מסגרת). מסגרת כזו שכבר
// קיימת בעמוד עדיין נטענת ומוצגת (שבב אחד, של הזרם שלה) ואפשר להחליף לה זרם — בלי מיגרציה
const HEADING_TITLE = 'מסגרת-כותרת מגרסה קודמת. היום כותרת אינה מסגרת: היא חלק מהטקסט, בסגנון-הפסקה «כותרת»'
const isNotesKey = (k) => /^notes\d?$/.test(String(k || ''))

// כפתור-זרם (נקודת-צבע + שם) — גם בסרגל "מסגרת חדשה" של ScanPanel
export function StreamChip({ s, active, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] ${active ? 'font-bold' : 'border-surface-variant bg-white hover:bg-neutral-50'}`}
      style={active ? { borderColor: s.color, background: `color-mix(in srgb, ${s.color} 14%, white)` } : undefined}
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
      {s.he}
    </button>
  )
}

// בחירת הזרם של מסגרת — אותה בחירה בחלונית ובסרגל "מסגרת חדשה": זרמי-התוכן, "ריהוט הדף", ו"עוד…"
// לזרמים נדירים ולסוג-הריהוט המדויק. כותרת אינה מסגרת (2026-10-05) — בלי זרמי-הכותרת; מסגרת שכבר בזרם-כותרת
// מוצגת בשבב שלה בלבד. value — הזרם הנוכחי (או FURNITURE_CHOICE); onPick(key) רק כשהבחירה משתנה.
export function StreamPicker({ chips, value, onPick, label = 'הזרם של המסגרת', className = '' }) {
  const c = { ...EMPTY_CHIPS, ...(chips || {}) }
  const furnitureOn = value === FURNITURE_CHOICE || isFurnitureStream(value)
  const pick = (key) => {
    if (key === value || (key === FURNITURE_CHOICE && furnitureOn) || (key === NOTES_RUNHEAD_CHOICE && value === 'header')) return
    onPick?.(key)
  }
  const rare = c.more
  // מסגרת קיימת בזרם-כותרת (מגרסה קודמת): רק השבב שלה, כדי שיראו אותו
  const legacyHeading = [...c.headings, ...c.moreHeadings].find((s) => s.key === value) || null
  const inSelect = [...rare, ...c.furniture].some((s) => s.key === value)
  const furniture = choiceInfo(null, FURNITURE_CHOICE)
  // רק בעמוד/ספר שיש בו הערות — שם המתנדבים בחרו "כותרת הערות" (שנכנסת לספר) לכותרת-הרצה שלהן
  const notesRunhead = c.content.some((s) => isNotesKey(s.key)) ? choiceInfo(null, NOTES_RUNHEAD_CHOICE) : null

  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-1 ${className}`}>
      {c.content.map((s) => (
        <StreamChip key={s.key} s={s} active={value === s.key} onClick={() => pick(s.key)} />
      ))}
      {legacyHeading && <StreamChip s={legacyHeading} active onClick={() => {}} title={HEADING_TITLE} />}
      <StreamChip s={furniture} active={furnitureOn} onClick={() => pick(FURNITURE_CHOICE)} title={FURNITURE_TITLE} />
      {notesRunhead && <StreamChip s={notesRunhead} active={false} onClick={() => pick(NOTES_RUNHEAD_CHOICE)} title={NOTES_RUNHEAD_TITLE} />}
      {rare.length + c.furniture.length > 0 && (
        <select
          value={inSelect ? value : ''}
          onChange={(e) => e.target.value && pick(e.target.value)}
          aria-label="זרם אחר"
          className={`h-6 max-w-[9rem] rounded border bg-white px-1 text-[11px] ${inSelect ? 'border-primary font-bold' : 'border-surface-variant'}`}
        >
          <option value="">עוד…</option>
          {rare.map((s) => (
            <option key={s.key} value={s.key}>{s.he}</option>
          ))}
          {c.furniture.length > 0 && (
            <optgroup label="ריהוט הדף (לא נכנס לספר)">
              {c.furniture.map((s) => (
                <option key={s.key} value={s.key}>{s.he}</option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </div>
  )
}

export default function FramePopover({
  frame,
  seq = null,
  seqCount = 0,
  orderIndex = 0,
  orderCount = 1,
  chips = null,
  suggested = false,
  style,
  className = '',
  onStream,
  onSeq,
  onOrder,
  onKind,
  onDelete,
  onClose,
  onClaimLine = null,
  claimTitle,
  extra = null,
}) {
  if (!frame) return null
  const obj = isObjectFrame(frame)

  return (
    <div
      role="group"
      aria-label="עריכת מסגרת"
      dir="rtl"
      data-testid="frame-popover"
      className={`w-[300px] max-w-full space-y-1.5 rounded-lg border border-surface-variant bg-white p-2 text-[11px] text-on-surface shadow-lg ${className}`}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <b className="text-xs">מסגרת {frame.order} בסדר הקריאה</b>
        {suggested && <span className="rounded bg-neutral-100 px-1 text-[10px] text-neutral-600">הצעה</span>}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירה"
          title="סגירת החלונית (המסגרת נשארת בחורה — אפשר להמשיך לשנות את גודלה; Esc מבטל את הבחירה)"
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {!obj && (
        <div className="flex items-start gap-1">
          <span className="mt-1 shrink-0 text-neutral-600">זרם:</span>
          <StreamPicker chips={chips} value={frame.stream} onPick={onStream} />
        </div>
      )}

      {!obj && seq != null && (
        <div className="flex items-center gap-1" title="המסגרת הכמה בזרם הזה — למשל טור ימני = 1, טור שמאלי = 2">
          <span className="text-neutral-600">מספר בזרם:</span>
          <button type="button" className={small} disabled={seq <= 1} onClick={() => onSeq?.(seq - 1)} aria-label="מספר קטן יותר בזרם">
            −
          </button>
          <b className="min-w-4 text-center tabular-nums" data-testid="frame-seq">{seq}</b>
          <button type="button" className={small} disabled={seq >= seqCount} onClick={() => onSeq?.(seq + 1)} aria-label="מספר גדול יותר בזרם">
            +
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-neutral-600" title="סדר הקריאה של המסגרות בעמוד (המספר בעיגול)">סדר:</span>
        <button type="button" className={small} disabled={orderIndex <= 0} onClick={() => onOrder?.(-1)} title="מוקדם יותר בסדר הקריאה">
          הקודם
        </button>
        <button type="button" className={small} disabled={orderIndex >= orderCount - 1} onClick={() => onOrder?.(1)} title="מאוחר יותר בסדר הקריאה">
          הבא
        </button>
        <span className="flex-1" />
        <select
          value={obj ? frame.kind : ''}
          onChange={(e) => onKind?.(e.target.value || null)}
          aria-label="סוג המסגרת"
          title="מסגרת סביב טבלה/איור/לוח — השורות שבתוכה לא נקלטות לזרם"
          className="h-6 rounded border border-surface-variant bg-white px-1 text-[11px]"
        >
          <option value="">טקסט</option>
          {Object.entries(FRAME_OBJECT_KINDS).map(([k, v]) => (
            <option key={k} value={k}>{v} (לא טקסט)</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          title="מחיקת המסגרת (Delete)"
          className="flex h-6 items-center gap-0.5 rounded px-1.5 text-danger-700 hover:bg-danger-50"
        >
          <span className="material-symbols-outlined text-sm">delete</span>
          מחיקה
        </button>
      </div>

      {onClaimLine && (
        <div className="flex items-center gap-1 rounded bg-danger-50 px-1.5 py-1 text-danger-700" data-testid="popover-claim">
          <span className="flex-1">השורה שבסמן בולטת מהמסגרת הזו</span>
          <button type="button" className={small} onClick={onClaimLine} title={claimTitle}>
            השורה שייכת למסגרת הזו
          </button>
        </div>
      )}

      {extra != null && extra !== false && (
        <div className="flex flex-wrap items-center gap-1 border-t border-surface-variant pt-1.5" data-testid="frame-extra">
          {extra}
        </div>
      )}

      {suggested && <p className="text-[10px] leading-snug text-neutral-500">זו הצעה של המחשב — שינוי כאן ישמור את כל המסגרות המוצעות כמסגרות שלכם.</p>}
    </div>
  )
}
