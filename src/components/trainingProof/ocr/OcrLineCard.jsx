'use client'

import { memo, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { OCR_ACTION_LABELS } from '@/lib/trainingProof/vocab'
import ScriptTag from '../common/ScriptTag'
import Kbd from '../common/Kbd'
import { boxStyle } from '../common/boxStyle'
import { useInkWords } from '../router/useInkWords'
import OcrTextEditor, { TEXT_CLASS, TEXT_STYLE } from './OcrTextEditor'
import { inkBoxFor } from './caretWord'
import { SCREEN_ACTIONS, keyOf } from './screenKeys'

// פס-הצבע בצד הכרטיס לפי מה שסומן — כמו מסך ההגהה בתחנה
const EDGE = {
  ok: 'border-s-success',
  fixed: 'border-s-info',
  seg: 'border-s-error',
  bad: 'border-s-error',
  router: 'border-s-feature-600',
  skip: 'border-s-outline-variant opacity-70',
}

// הכפתורים — בסדר של SCREEN_ACTIONS, והמקש של כל אחד משם (בלי "חיתוך גרוע", screenKeys)
const BUTTON_OF = {
  ok: { label: 'נכון', icon: 'check', variant: 'tonal' },
  fixed: { label: 'תקן', icon: 'edit', variant: 'outlined' },
  skip: { label: 'דלג', icon: 'redo', variant: 'text' },
  bad: { label: 'לא קריא', icon: 'block', variant: 'text' },
  router: {
    label: 'הכתב שגוי',
    icon: 'call_split',
    variant: 'text',
    title: 'השורה תצא מההגהה ותחזור לנתב הכתב. אחרי שייקבע הכתב הנכון — היא תחזור להגהה',
  },
}
const BUTTONS = SCREEN_ACTIONS.map((action) => ({ action, key: keyOf(action), ...BUTTON_OF[action] }))

const shownText = (item) => (item.result?.action === 'fixed' ? item.result.text : item.text)

// שורה אחת בזיהוי-הטקסט: התמונה, הטקסט (מוגה כולו — בלי מילה-מילה, ה-6), וחמשת הכפתורים.
// "תקן" (2, או לחיצה כפולה על הטקסט) פותח עריכה במקום: Enter שומר, Esc מבטל.
// בעריכה המילה שתחת הסמן מסומנת בטקסט, ועל התמונה — רק כשהחלוקה לפי הדיו תואמת (caretWord).
function OcrLineCard({ item, index, total, current, saving, editing, onSelect, onMark, onEdit, onCancelEdit, onShowCtx }) {
  const action = item.skipped ? 'skip' : item.status === 'submitted' ? item.result?.action : null
  const ltr = item.track === 'latin'
  const [caretWord, setCaretWord] = useState(null)
  // המילים בתמונה לפי הדיו (כמו בנתב) — מחושבות בפתיחה הראשונה של העריכה ונשמרות
  const ink = useInkWords(item.img, editing)
  const inkBox = editing && caretWord && item.w && item.h ? inkBoxFor({ ...caretWord, boxes: ink, ltr }) : null

  // סיום העריכה: ריק או בלי שינוי בשורה שכבר סומנה — ביטול; אחרת "תוקן" (השרת הופך זהה ל"נכון")
  const commit = (v) => {
    if (!v || (v === shownText(item) && action)) return onCancelEdit()
    onMark('fixed', v)
  }

  return (
    <article
      id={`tp-line-${item.id}`}
      aria-current={current ? 'true' : undefined}
      // מקבל מיקוד בכניסה לסבב (OcrScreen) — לא בטאב
      tabIndex={-1}
      onClick={(e) => {
        if (!e.target.closest('button,a,textarea')) onSelect()
      }}
      className={`scroll-mt-32 rounded-2xl border border-outline-variant border-s-[5px] bg-(--card-bg) px-4 py-3 shadow-sm ${
        action ? EDGE[action] : 'border-s-outline-variant'
      } ${current ? 'outline-2 outline-primary' : ''}`}
    >
      {/* גובה קבוע לשורת-המצב: "ממתינה" ← "שומר…" ← "נשמר" (עם אייקון) לא מזיזים את הכרטיסים שמתחת.
          במסך צר המצב תמיד בשורה משלו — אחרת "נשמר באתר…" הארוך נשבר לשורה נוספת */}
      <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-on-surface-variant">
        <span>
          שורה {index + 1} מתוך {total}
        </span>
        <ScriptTag script={item.track} />
        <span>{item.source === 'synth' ? 'שורה סינתטית — התמלול ידוע, בדקו שהתמונה תואמת' : 'זיהוי המודל'}</span>
        <span className="flex max-sm:basis-full">
          {saving ? (
            <span>שומר…</span>
          ) : action ? (
            <span className="inline-flex items-center gap-1 text-success">
              <AppIcon name="check_circle" className="text-base leading-none" />
              {action === 'skip' ? 'דילגתם — השורה חזרה למאגר' : `נשמר באתר: ${OCR_ACTION_LABELS[action]} · ממתין לאישור המנהל`}
            </span>
          ) : (
            <span className="rounded-md bg-surface-container-highest px-2">ממתינה</span>
          )}
        </span>
        {item.ctx ? (
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={onShowCtx}>
            הצג בעמוד המלא
          </button>
        ) : null}
      </div>

      <div className="relative my-2 inline-block max-w-full overflow-hidden rounded border border-outline-variant bg-white leading-none">
        {/* width/height — המקום של התמונה שמור עוד לפני שנטענה, כדי שהכרטיסים לא יזוזו כשהיא מגיעה */}
        <img
          src={item.img}
          alt={`תמונת שורה ${index + 1}`}
          width={item.w || undefined}
          height={item.h || undefined}
          className="block h-auto max-w-full"
          style={{ maxWidth: Math.min(item.w || 900, 900) }}
          draggable={false}
        />
        {inkBox ? (
          <span
            data-tp-word-mark={caretWord.k}
            aria-hidden="true"
            className="pointer-events-none absolute rounded-sm bg-warning-400/25 outline-2 outline-offset-1 outline-warning-500"
            style={boxStyle(inkBox, item.w, item.h)}
          />
        ) : null}
      </div>

      {editing ? (
        <OcrTextEditor initial={shownText(item)} ltr={ltr} onCommit={commit} onCancel={onCancelEdit} onCaret={setCaretWord} />
      ) : (
        <p dir={ltr ? 'ltr' : 'rtl'} className={`min-h-[1.5em] cursor-text ${TEXT_CLASS} ${ltr ? 'text-left' : ''}`} style={TEXT_STYLE} onDoubleClick={() => !item.skipped && onEdit()}>
          {shownText(item)}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {BUTTONS.map((b) => (
          <Button
            key={b.action}
            size="sm"
            variant={action === b.action ? 'filled' : b.variant}
            icon={b.icon}
            title={b.title}
            disabled={item.skipped || saving}
            onClick={() => (b.action === 'fixed' ? onEdit() : onMark(b.action))}
          >
            {b.label} <Kbd>{b.key}</Kbd>
          </Button>
        ))}
      </div>
    </article>
  )
}

export default memo(OcrLineCard)
