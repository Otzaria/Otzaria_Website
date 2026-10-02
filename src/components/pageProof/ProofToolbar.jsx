'use client'

import { PARA_STYLES, streamMenu } from '@/lib/pageProof/vocab'
import { styleActive } from '@/lib/pageProof/flowEdit'
import ToolbarMenu from './ToolbarMenu'

// סרגל-הכלים של עורך הגהת-העמודים — בנוסח סרגל העורך הישן של האתר
// (components/editor/EditorToolbar): פס לבן, קבוצות-כפתורים אפורות, כפתורים
// של 28px וטולטיפ עם קיצור-המקלדת. מימין לשמאל: ביטול/חזרה · סגנון-פסקה ·
// עיצוב-תווים · פסקאות · קישור · מילים חשודות · זרם לשורות · פגם בדפוס · תצוגה · עזרה ופרטים
// · ובקצה השמאלי — כפתורי הדף העוטף (actions, למשל "הגשה").
//
// כפתור שאין לו פעולה (handler חסר) — מושבת: כך העורך אומר "לא רלוונטי עכשיו"
// (אין בחירה, אין פסקה לחבר, תצוגה בלבד). readOnly (רשות) משבית את כל כלי-
// העריכה ומשאיר ניווט, תצוגה, עזרה ופרטים.
// כפתורי-העיצוב אינם לוקחים פוקוס (mousedown ← preventDefault), כדי שהבחירה
// בטקסט תישאר כשלוחצים עליהם.
// לדף עוטף (תוכנת-הספר), רשות: charStyleButtons — כפתורי עיצוב-התווים (ברירת-המחדל
// CHAR_STYLE_BUTTONS; כל key חייב להיות ב-vocab.CHAR_STYLES); moreMenu = {items, onSelect,
// label?, title?} — תפריט "⋯" לפני "עזרה" (פריטים כמו ב-ToolbarMenu); paraStyleOptions — הפריטים
// בתפריט "סגנון פסקה" (ברירת-המחדל PARA_STYLE_OPTIONS; פריט {separator:true} = קו; כל key חייב
// להיות ב-vocab.PARA_STYLES — למשל סגנונות שהוגדרו לספר ונרשמו ב-registerVocab). בלעדיהם — כמו באתר.

// סגנונות-הפסקה שבסרגל: כותרות (ל-<h2>–<h4> באוצריא), ציטוט (<blockquote>),
// דיבור-המתחיל (מודגש ומקושר למקור), ועוד ארבעה סוגי-פסקה שתוכנת-הספר מכירה
// (vocab.PARA_STYLES) — סעיף ממוספר, הגהה, שורות קצרות ושורת תוכן-עניינים.
// hint = ההסבר הקצר (בריחוף על הפריט, ובעזרה)
export const PARA_STYLE_OPTIONS = [
  { key: 'body', he: 'טקסט רגיל', hint: 'טקסט רץ של הספר' },
  { key: 'h1', he: 'כותרת ראשית', hint: 'כותרת עליונה בספר — נכנסת לתוכן-העניינים' },
  { key: 'h2', he: 'כותרת פרק', hint: 'כותרת של פרק — רמה אחת מתחת לראשית' },
  { key: 'h3', he: 'כותרת משנה', hint: 'כותרת קטנה בתוך פרק' },
  { key: 'quote', he: 'ציטוט', hint: 'פסקה מובאת (פסוק, לשון משנה) — מוצגת מוזחת' },
  { key: 'dh', he: 'דיבור המתחיל', hint: 'פסקת פירוש שנפתחת בציטוט — מילות הציטוט מודגשות ומקושרות למקור' },
  { key: 'list', he: 'סעיף ממוספר', hint: 'סעיף שנפתח באות או במספר, כמו "א גרסינן"' },
  { key: 'gloss', he: 'הגהה', hint: 'קטע שמסומן בכוכבית או בסוגריים' },
  { key: 'poem', he: 'שורות קצרות (שירה)', hint: 'שירה או פיוט — שורות קצרות, בלי יישור לשני הצדדים' },
  { key: 'toc', he: 'שורת תוכן עניינים', hint: 'שורה בתוכן העניינים — שם הפרק ומספר העמוד' },
]

// קבוצות בתפריט, עם קו ביניהן: טקסט רגיל · כותרות · סוגי-פסקה
const PARA_GROUP_START = new Set(['h1', 'quote'])
// הפעולות בסוף תפריט "סגנון פסקה" (מפתחות שאינם סגנון)
const PARA_ACTION_SPLIT = '__split'
const PARA_ACTION_JOIN = '__join'

// איך כל סגנון נראה בתפריט (תצוגה מקדימה קטנה). סימני-הדוגמה (א., *, קו-נקודות)
// מוסתרים מקוראי-מסך — השם הנגיש הוא שם הסגנון בלבד
const PARA_PREVIEW_CLS = {
  h1: 'text-base font-bold',
  h2: 'text-sm font-bold',
  h3: 'text-xs font-bold',
  quote: 'border-s-2 border-neutral-300 ps-2 italic',
}

function paraPreview(o) {
  switch (o.key) {
    case 'dh':
      return (
        <span>
          <b>דיבור</b> המתחיל
        </span>
      )
    case 'list':
      return (
        <span>
          <b aria-hidden="true" className="me-1">
            א.
          </b>
          {o.he}
        </span>
      )
    case 'gloss':
      return (
        <span className="text-[11px] text-on-surface/80">
          <b aria-hidden="true" className="me-0.5">
            *
          </b>
          {o.he}
        </span>
      )
    case 'poem':
      // שתי שורות קצרות (רווח בין פריטי-flex אינו מוצג — רק לשם הנגיש)
      return (
        <span className="inline-flex flex-col leading-tight">
          <span>שורות קצרות</span> <span className="text-[10px] text-on-surface/60">(שירה)</span>
        </span>
      )
    case 'toc':
      return (
        <span className="flex items-baseline gap-1">
          <span className="shrink-0">{o.he}</span>
          <span aria-hidden="true" className="min-w-3 flex-1 border-b border-dotted border-neutral-400" />
          <span aria-hidden="true" className="text-[10px] tabular-nums text-on-surface/60">
            12
          </span>
        </span>
      )
    default:
      return <span className={PARA_PREVIEW_CLS[o.key] || undefined}>{o.he}</span>
  }
}

// "ריהוט הדף" בתפריט הזרם — אחרי קו, בשם של הלשונית שלו: מה בדף נחשב כזה
const FURNITURE_MENU = {
  header: { hint: 'כותרת-רצה', title: 'כותרת-רצה בראש העמוד (שם הספר, הפרק או הדף) — חלק מהדף ולא מהספר' },
  footer: { hint: 'מספר עמוד', title: 'מספר העמוד, שומר-דף או שורת תחתית — חלק מהדף ולא מהספר' },
  sep: { hint: 'קו בלבד', title: 'קו מפריד בין אזורי-הטקסט (גם מעוטר). קישוט או כתם שנקרא כטקסט — סמנו "לא-שורה" במקום' },
}

// מודגש לחוץ גם על heavy (הדגשה שגלאי-הטיפוגרפיה מצא — גם היא <b> באוצריא);
// B כבוי מוריד את שתיהן (flowEdit.planCharStyle)
export const CHAR_STYLE_BUTTONS = [
  { key: 'b', sign: 'B', he: 'מודגש', shortcut: 'Ctrl+B', cls: 'font-bold text-xs' },
  { key: 'i', sign: 'I', he: 'נטוי', shortcut: 'Ctrl+I', cls: 'italic font-serif text-xs' },
  { key: 'big', sign: 'A+', he: 'אותיות גדולות', cls: 'text-xs font-medium' },
  { key: 'small', sign: 'A-', he: 'אותיות קטנות', cls: 'text-[10px] font-medium' },
  { key: 'sup', sign: 'x²', he: 'כתב עילי — אות קטנה מורמת', cls: 'text-xs font-medium' },
  { key: 'latin', sign: 'EN', he: 'לועזית — מילים באנגלית (משמאל לימין)', cls: 'font-sans text-[10px] font-bold' },
]

// גופני-התצוגה (משנים רק את התצוגה בעורך — לא את הספר)
export const PROOF_FONTS = [
  { value: 'var(--font-frank)', he: 'פרנק-רוהל' },
  { value: "'Times New Roman', serif", he: 'טיימס' },
  { value: "David, 'David CLM', serif", he: 'דוד' },
  { value: 'Arial, sans-serif', he: 'אריאל' },
  { value: "'Courier New', monospace", he: 'רוחב קבוע' },
]
export const DEFAULT_PROOF_FONT = PROOF_FONTS[0].value

export const PROOF_FONT_SIZE = { min: 12, max: 40, step: 2, default: 20 }
export const clampFontSize = (n) =>
  Math.max(PROOF_FONT_SIZE.min, Math.min(PROOF_FONT_SIZE.max, Math.round(Number.isFinite(n) ? n : PROOF_FONT_SIZE.default)))

const isFn = (f) => typeof f === 'function'
const preventFocusLoss = (e) => e.preventDefault()

function Group({ label, children }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0 rounded-md bg-neutral-100 p-0.5">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="h-5 w-px bg-neutral-200" aria-hidden="true" />
}

// כפתור בתוך קבוצה אפורה (כמו B/I/A+ בסרגל הישן)
function GroupButton({ label, title, onClick, disabled, pressed, wide = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={preventFocusLoss}
      onClick={onClick}
      className={`flex h-7 items-center justify-center gap-1 rounded text-neutral-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        wide ? 'px-2' : 'w-7'
      } ${pressed ? 'bg-white text-primary shadow-sm ring-1 ring-neutral-200' : ''}`}
    >
      {children}
    </button>
  )
}

// כפתור לבן עם מסגרת, אייקון ותווית (כמו "חיפוש"/"איות" בסרגל הישן)
function LabeledButton({ label, title, onClick, disabled, pressed, tone = 'neutral', children }) {
  const on = tone === 'info' ? 'border-info-200 bg-info-50 text-info-700' : 'border-neutral-300 bg-neutral-100 text-neutral-900'
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={preventFocusLoss}
      onClick={onClick}
      className={`flex h-7 items-center gap-1 rounded-md border px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed ? on : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  )
}

export default function ProofToolbar({
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  paraStyle = null,
  onParaStyle,
  charStyles,
  onCharStyle,
  onSplitPara,
  onJoinPara,
  onLink,
  linkPending = null,
  onSuggest,
  onNextSuspicious,
  streams = [],
  onStreamForLines,
  // "פגם בדפוס" (מתג לשורות שבבחירה): printDefect — שורת-הסמן כבר מסומנת
  onPrintDefect,
  printDefect = false,
  fontSize = PROOF_FONT_SIZE.default,
  setFontSize,
  fontFamily = DEFAULT_PROOF_FONT,
  setFontFamily,
  onHelp,
  detailsOpen = false,
  onToggleDetails,
  actions = null,
  readOnly = false,
  // דביק מתחת לכותרת האתר (h-16 + הגבול שלה); בתוך חלון (ReviewModal) — top-0
  className = 'sticky top-[calc(var(--spacing)*16_+_1px)] z-30',
  charStyleButtons = CHAR_STYLE_BUTTONS,
  moreMenu = null,
  paraStyleOptions = PARA_STYLE_OPTIONS,
}) {
  const active = charStyles instanceof Set ? charStyles : new Set(Array.isArray(charStyles) ? charStyles : [])
  const edit = (f) => !readOnly && isFn(f)
  const cur = paraStyleOptions.find((o) => !o.separator && o.key === (paraStyle || null))
  // סגנון שאינו בתפריט (למשל "הערה" מהזיהוי) — מוצג בשמו ולא כ"ללא סגנון"
  const curHe = cur?.he || (paraStyle && PARA_STYLES[paraStyle]?.he) || null
  const size = clampFontSize(fontSize)
  const fonts = PROOF_FONTS.some((f) => f.value === fontFamily) || !fontFamily ? PROOF_FONTS : [...PROOF_FONTS, { value: fontFamily, he: 'אחר' }]

  // קו בין קבוצות — לא בראש התפריט ולא שניים ברצף (כשהדף העוטף מעביר רשימה משלו)
  const paraItems = []
  const sep = () => {
    if (paraItems.length && !paraItems[paraItems.length - 1].separator) paraItems.push({ separator: true })
  }
  for (const o of paraStyleOptions) {
    if (o.separator) {
      sep()
      continue
    }
    if (PARA_GROUP_START.has(o.key)) sep()
    paraItems.push({ key: o.key, checked: o.key === cur?.key, title: o.hint, label: paraPreview(o) })
  }
  // ובסוף התפריט — הפעולות על הפסקה, בשם מלא (בסרגל הן אייקונים בלבד)
  paraItems.push(
    { separator: true },
    { key: PARA_ACTION_SPLIT, action: true, icon: 'format_paragraph', label: 'פסקה חדשה במקום הסמן', hint: 'Enter', disabled: !edit(onSplitPara) },
    { key: PARA_ACTION_JOIN, action: true, icon: 'merge', label: 'חיבור לפסקה הקודמת', hint: 'Backspace בתחילתה', disabled: !edit(onJoinPara) }
  )
  const onParaMenu = (key) => {
    if (key === PARA_ACTION_SPLIT) onSplitPara?.()
    else if (key === PARA_ACTION_JOIN) onJoinPara?.()
    else onParaStyle?.(key)
  }

  // זרמי-התוכן, ואחרי קו — "ריהוט הדף" (כותרת עמוד, תחתית, מפריד): תמיד בתפריט,
  // בשם של הלשונית שלו. "מפריד" = הקו שבין אזורי-הטקסט בלבד; קישוט או כתם שנקרא
  // כשורה — "לא-שורה" (הכפתור שליד שורה ריקה / לוח הפרטים), כמו במדריך
  const menu = streamMenu(streams)
  const streamItems = [
    ...menu.content.map((s) => ({ key: s.key, label: s.he, color: s.color })),
    ...(menu.content.length ? [{ separator: true }] : []),
    ...menu.furniture.map((s) => ({
      key: s.key,
      // שתי שורות: השם, ומתחתיו מה זה (הרווח שביניהן — לשם הנגיש)
      label: (
        <span className="flex flex-col leading-tight">
          <span>
            <span className="text-on-surface/60">ריהוט הדף ·</span> {s.he}
          </span>{' '}
          <span className="text-[10px] text-on-surface/50">{FURNITURE_MENU[s.key] ? `${FURNITURE_MENU[s.key].hint} · לא נכנס לספר` : 'לא נכנס לספר'}</span>
        </span>
      ),
      color: s.color,
      title: FURNITURE_MENU[s.key]?.title,
    })),
  ]

  return (
    <div role="toolbar" aria-label="כלי ההגהה" dir="rtl" className={`border-b border-neutral-200 bg-white shadow-sm ${className}`}>
      <div className="flex w-full flex-wrap items-center gap-1.5 px-3 py-1.5">
        {/* ביטול / חזרה */}
        <Group label="ביטול וחזרה">
          <GroupButton label="ביטול" title="ביטול הפעולה האחרונה (Ctrl+Z)" onClick={onUndo} disabled={!edit(onUndo) || !canUndo}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">undo</span>
          </GroupButton>
          <GroupButton label="חזרה" title="חזרה על מה שבוטל (Ctrl+Y)" onClick={onRedo} disabled={!edit(onRedo) || !canRedo}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">redo</span>
          </GroupButton>
        </Group>

        <Divider />

        {/* סגנון-פסקה */}
        <ToolbarMenu
          ariaLabel="סגנון הפסקה"
          title="סגנון הפסקה — כותרת, ציטוט, דיבור המתחיל, סעיף ממוספר, הגהה, שירה או תוכן עניינים. חל על כל הפסקה שבה הסמן (או על כל הפסקאות שבבחירה)"
          disabled={!edit(onParaStyle)}
          label={<span className="inline-block w-20 truncate text-right">{curHe || 'סגנון פסקה'}</span>}
          items={paraItems}
          onSelect={onParaMenu}
          menuClassName="w-56"
        />

        <Divider />

        {/* עיצוב-תווים — מתג: לחיצה על עיצוב פעיל מסירה אותו */}
        <Group label="עיצוב תווים">
          {charStyleButtons.map((c) => {
            const on = styleActive(active, c.key)
            return (
              <GroupButton
                key={c.key}
                label={c.he}
                title={`${c.he}${c.shortcut ? ` (${c.shortcut})` : ''}${on ? ' — לחיצה מסירה' : ''}`}
                pressed={on}
                disabled={!edit(onCharStyle)}
                onClick={() => onCharStyle?.(c.key, !on)}
              >
                <span className={c.cls}>{c.sign}</span>
              </GroupButton>
            )
          })}
        </Group>

        <Divider />

        {/* פסקאות — אייקונים בלבד (לסרגל בשורה אחת ברוחב מחשב-נייד); השם בטולטיפ */}
        <Group label="פסקאות">
          <GroupButton label="פסקה חדשה" title="פסקה חדשה במקום הסמן (Enter)" onClick={onSplitPara} disabled={!edit(onSplitPara)}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">format_paragraph</span>
          </GroupButton>
          <GroupButton label="חיבור פסקאות" title="חיבור לפסקה הקודמת (Backspace בתחילת הפסקה)" onClick={onJoinPara} disabled={!edit(onJoinPara)}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">merge</span>
          </GroupButton>
        </Group>

        <Divider />

        {/* קישור בין זרמים */}
        <LabeledButton
          label={linkPending ? 'השלמת הקישור' : 'קישור'}
          title={
            linkPending
              ? 'השלמת הקישור: סמנו את המילה המקבילה בזרם השני ולחצו כאן שוב (Ctrl+K) · Esc לביטול'
              : 'קישור בין מילה בזרם אחד למילה המקבילה בזרם אחר — הערה לציון שלה, דיבור המתחיל למקור (Ctrl+K)'
          }
          pressed={!!linkPending}
          tone="info"
          onClick={onLink}
          disabled={!edit(onLink)}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">link</span>
          <span className="text-[10px] font-medium">{linkPending ? 'השלמת קישור' : 'קישור'}</span>
        </LabeledButton>

        <Divider />

        {/* מילים חשודות */}
        <Group label="מילים חשודות">
          <GroupButton label="הצעות למילה" title="הצעות למילה שבסמן (Alt+↓)" onClick={onSuggest} disabled={!isFn(onSuggest)}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">tips_and_updates</span>
          </GroupButton>
          <GroupButton label="המילה החשודה הקודמת" title="המילה החשודה הקודמת (Shift+F8)" onClick={() => onNextSuspicious?.(-1)} disabled={!isFn(onNextSuspicious)}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">keyboard_arrow_up</span>
          </GroupButton>
          <GroupButton label="המילה החשודה הבאה" title="המילה החשודה הבאה (F8)" onClick={() => onNextSuspicious?.(1)} disabled={!isFn(onNextSuspicious)}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">keyboard_arrow_down</span>
          </GroupButton>
        </Group>

        <Divider />

        {/* זרם לשורות — לשורה בודדת שנכנסה לזרם הלא-נכון (גם לריהוט הדף) */}
        <ToolbarMenu
          ariaLabel="זרם לשורות"
          title="העברת השורות שבבחירה לזרם אחר — לשורה בודדת שנכנסה לזרם הלא-נכון, או לריהוט הדף (כותרת עמוד, מספר עמוד, קו מפריד — לא נכנס לספר). את הזרמים קובעים בעיקר במסגרות על הסריקה"
          disabled={!edit(onStreamForLines) || !streamItems.length}
          label={<span>זרם</span>}
          heading="העברת השורות שבבחירה לזרם:"
          items={streamItems}
          onSelect={(key) => onStreamForLines?.(key)}
          menuClassName="w-72"
        />

        {/* פגם בדפוס — תיקון למה שאמור להיות בספר ולא למה שבסריקה: נכנס לספר, לא לאימון */}
        <LabeledButton
          label="פגם בדפוס"
          title={
            printDefect
              ? 'השורה מסומנת «פגם בדפוס» — לחיצה מסירה את הסימון'
              : 'פגם בדפוס: תיקנתי את השורה למה שאמור להיות כתוב בספר, לא למה שרואים בסריקה (נקודה במקום ו\', "כה" במקום "כח"). הטקסט המתוקן נכנס לספר, אבל השורה לא תשמש לאימון מודל-הזיהוי. חל על השורות שבבחירה'
          }
          pressed={!!printDefect}
          onClick={onPrintDefect}
          disabled={!edit(onPrintDefect)}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">flag</span>
          <span className="text-[10px] font-medium">פגם בדפוס</span>
        </LabeledButton>

        <Divider />

        {/* תצוגה: גודל וגופן (לא משנים את הספר). בכוונה לא "A+/A-" — אלה כבר
            כפתורי עיצוב-התו "אותיות גדולות/קטנות" באותו סרגל */}
        <Group label="גודל הטקסט בתצוגה">
          <GroupButton
            label="הקטנת הטקסט"
            title="הקטנת הטקסט בתצוגה (לא משנה את הספר)"
            onClick={() => setFontSize?.(clampFontSize(size - PROOF_FONT_SIZE.step))}
            disabled={!isFn(setFontSize) || size <= PROOF_FONT_SIZE.min}
          >
            <span className="text-sm font-bold leading-none">−</span>
          </GroupButton>
          <span className="min-w-[1.6rem] text-center text-[10px] font-medium tabular-nums text-neutral-700" title="גודל הטקסט בתצוגה">
            {size}
          </span>
          <GroupButton
            label="הגדלת הטקסט"
            title="הגדלת הטקסט בתצוגה (לא משנה את הספר)"
            onClick={() => setFontSize?.(clampFontSize(size + PROOF_FONT_SIZE.step))}
            disabled={!isFn(setFontSize) || size >= PROOF_FONT_SIZE.max}
          >
            <span className="text-sm font-bold leading-none">+</span>
          </GroupButton>
        </Group>
        <div className="relative">
          <select
            value={fontFamily || DEFAULT_PROOF_FONT}
            onChange={(e) => setFontFamily?.(e.target.value)}
            disabled={!isFn(setFontFamily)}
            aria-label="גופן התצוגה"
            title="גופן התצוגה (לא משנה את הספר)"
            className="h-7 w-24 cursor-pointer appearance-none rounded-md border border-neutral-200 bg-white pe-6 ps-2 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {fonts.map((f) => (
              <option key={f.value} value={f.value}>
                {f.he}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-sm text-neutral-500" aria-hidden="true">expand_more</span>
        </div>

        <Divider />

        {/* "⋯" — פעולות של הדף העוטף (רשות; באתר אין) */}
        {moreMenu?.items?.length > 0 && (
          <>
            <ToolbarMenu
              ariaLabel={moreMenu.title || 'עוד פעולות'}
              title={moreMenu.title || 'עוד פעולות'}
              label={<span aria-hidden="true">{moreMenu.label || '⋯'}</span>}
              items={moreMenu.items}
              onSelect={(key) => moreMenu.onSelect?.(key)}
              menuClassName="w-64"
            />
            <Divider />
          </>
        )}

        {/* עזרה ופרטים */}
        <LabeledButton label="עזרה" title="עזרה — מה עושים בעמוד, וקיצורי המקלדת" onClick={onHelp} disabled={!isFn(onHelp)} tone="info">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">help_outline</span>
          <span className="text-[10px] font-medium">עזרה</span>
        </LabeledButton>
        <LabeledButton
          label="פרטים"
          title={detailsOpen ? 'סגירת לוח הפרטים' : 'פרטים: קישורים, שורה, עמוד ושינויים'}
          onClick={onToggleDetails}
          disabled={!isFn(onToggleDetails)}
          pressed={!!detailsOpen}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">info</span>
          <span className="text-[10px] font-medium">פרטים</span>
        </LabeledButton>

        {actions != null && <div className="ms-auto flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
