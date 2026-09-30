'use client'

import { tokenize } from '@/lib/pageProof/textModel'
import { streamInfo } from '@/lib/pageProof/vocab'
import StreamTabs from './StreamTabs'
import { OtherPageButtons } from './OtherPagePicker'

// לוח-הטקסט: לשוניות-הזרמים, ומתחתן העורך (FlowEditor — מגיע מבחוץ ב-
// editorSlot) בתוך אזור-גלילה אחד. מעל העורך — פסי-הודעה לפי המצב: קישור
// שממתין לצד השני, שורות שזוהו מחדש (סבב שני), וזרם שכל פסקאותיו אושרו.
// בתחתית — שורת-רמז אחת: מה עושים כאן.
//
// props: view, tabs (streamTabs + approval לכל לשונית), tabKey, setTabKey,
// editorSlot, linkPending = {from:{lineId, words:[i,j], tabKey?, text?}} | null,
// onCancelLink, recheckCount, approval = {approved, total} של הלשונית הפעילה.
// onOtherPage(n) — רשות: הצד השני בעמוד אחר (n = מספר-העמוד, או null — "מספר עמוד…");
// בלעדיו אין בפס הקישור כפתורי-עמוד.
// רשות: readOnly, fontSize (px), fontFamily — חלים על אזור-הטקסט (העורך יורש).
// אזור-הגלילה מסומן data-proof-text-scroll (העורך עצמו לא צריך גלילה משלו).

export const TEXT_HINT =
  'הקלידו ישר בטקסט לתיקון · Enter — פסקה חדשה · Backspace בתחילת פסקה — חיבור · Ctrl+Enter — אישור הפסקה · מילים מסומנות = המחשב חושד בהן (ראו מקרא); ריחוף על מילה בכחול, סגול או כתום מציג הצעות'
export const TEXT_HINT_LEGEND =
  'קו אדום מקווקו — זיהוי לא בטוח, בלי הצעות: בדקו מול הסריקה · קו כחול מנוקד — יש חלופות (ריחוף) · רקע סגול — מודל-השפה מציע מילה אחרת (ריחוף) · רקע כתום — חלופת-זיהוי מתאימה יותר להקשר (ריחוף) · מודגש אפור — דיבור המתחיל, מודגש אוטומטית'
const READONLY_HINT = 'תצוגה בלבד — אפשר לעבור על הטקסט ולבדוק אותו, אבל לא לשנות'
const FURNITURE_HINT = 'ריהוט הדף (כותרת-רצה, מספר עמוד, קו מפריד) אינו נכנס לספר — רק בדקו שלא הגיע לכאן טקסט של הספר עצמו'

// המקרא הגלוי של הסימונים בטקסט (אותם סגנונות כמו ב-FlowEditor): דוגמה קטנה
// ומילה-שתיים; ההסבר המלא בריחוף
export const MARK_LEGEND = [
  {
    key: 'low',
    he: 'לא בטוח',
    cls: 'underline decoration-dashed decoration-danger-500 decoration-2 underline-offset-[4px]',
    title: 'קו אדום מקווקו — המחשב לא בטוח במילה ואין לו הצעה: בדקו אותה מול הסריקה',
  },
  {
    key: 'alt',
    he: 'יש חלופות',
    cls: 'underline decoration-dotted decoration-info-600 decoration-2 underline-offset-[4px]',
    title: 'קו כחול מנוקד — למודל-הזיהוי יש מילים חלופיות: ריחוף על המילה מציג אותן',
  },
  { key: 'lm', he: 'הצעת מודל-השפה', cls: 'rounded-sm bg-feature-100', title: 'רקע סגול — מודל-השפה מציע מילה דומה שמתאימה יותר להקשר: ריחוף מציג אותה' },
  { key: 'rec', he: 'חלופה מתאימה', cls: 'rounded-sm bg-warning-strong-100', title: 'רקע כתום — אחת מחלופות הזיהוי מתאימה יותר להקשר: ריחוף מציג אותה' },
  { key: 'auto', he: 'מודגש אוטומטית', cls: 'font-bold text-on-surface/60', title: 'מודגש אפור — מילות דיבור-המתחיל מודגשות אוטומטית; אין צורך לסמן אותן B' },
]

function Legend() {
  return (
    <ul aria-label="מקרא הסימונים בטקסט" className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
      <li aria-hidden="true" className="font-bold text-on-surface/70">
        מקרא:
      </li>
      {MARK_LEGEND.map((m) => (
        <li key={m.key} title={m.title} className="flex cursor-help items-center gap-1">
          <span aria-hidden="true" className={`px-0.5 text-[12px] text-on-surface ${m.cls}`}>
            אבג
          </span>
          <span>{m.he}</span>
        </li>
      ))}
    </ul>
  )
}

const MAX_LINK_TEXT = 40

// מה נבחר בצד הראשון של קישור ממתין: המילים והזרם שלהן
export function linkFromInfo(view, tabs, from) {
  if (!from) return null
  const line = (view?.lines || []).find((l) => l?.id === from.lineId) || null
  let text = typeof from.text === 'string' ? from.text.trim() : ''
  const range = Array.isArray(from.words) ? from.words : Array.isArray(from.from_words) ? from.from_words : null
  if (!text && line && range && Number.isInteger(range[0])) {
    const words = tokenize(line.text).filter((t) => t.w === 'word')
    const a = Math.max(0, range[0])
    const b = Number.isInteger(range[1]) ? Math.max(a, range[1]) : a
    text = words
      .slice(a, b + 1)
      .map((t) => t.text)
      .join(' ')
  }
  if (text.length > MAX_LINK_TEXT) text = `${text.slice(0, MAX_LINK_TEXT - 1)}…`
  const lineTab = line ? streamInfo(view, line.stream).key : null
  const tabKey = from.tabKey ?? lineTab
  const tab = (tabs || []).find((t) => t.key === tabKey)
  const streamHe = tab?.he || (line ? streamInfo(view, line.stream).he : '')
  return { text, tabKey, streamHe }
}

function Banner({ tone, icon, children, action = null }) {
  const cls = {
    info: 'border-info-200 bg-info-50 text-info-800',
    warn: 'border-warning-alt-200 bg-warning-alt-100 text-warning-alt-900',
    ok: 'border-success-200 bg-success-50 text-success-800',
  }[tone]
  return (
    <div role="status" className={`flex items-center gap-2 border-b px-3 py-1.5 text-xs ${cls}`}>
      {icon}
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      {action}
    </div>
  )
}

export default function TextPanel({
  view,
  tabs = [],
  tabKey,
  setTabKey,
  editorSlot = null,
  linkPending = null,
  onCancelLink,
  onOtherPage = null,
  recheckCount = 0,
  approval = null,
  readOnly = false,
  fontSize = null,
  fontFamily = null,
  className = '',
}) {
  const active = tabs.find((t) => t.key === tabKey) || null
  const from = linkPending ? linkFromInfo(view, tabs, linkPending.from) : null
  const sameTab = !!(from && from.tabKey && from.tabKey === tabKey)
  const total = Number(approval?.total) || 0
  const allApproved = total > 0 && (Number(approval?.approved) || 0) >= total
  // הלשונית הבאה שעוד לא אושרה כולה (לכפתור "ללשונית הבאה")
  const nextOpen = allApproved
    ? tabs.find((t) => !t.furniture && t.key !== tabKey && Number(t.approval?.total) > 0 && (Number(t.approval?.approved) || 0) < Number(t.approval.total))
    : null
  const hint = readOnly ? READONLY_HINT : active?.furniture ? FURNITURE_HINT : TEXT_HINT
  const textStyle = {
    ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize: `${fontSize}px` } : {}),
    ...(fontFamily ? { fontFamily } : {}),
  }

  return (
    <section dir="rtl" aria-label="טקסט העמוד" className={`glass-strong flex min-h-0 flex-col overflow-hidden rounded-xl ${className}`}>
      <StreamTabs tabs={tabs} tabKey={tabKey} setTabKey={setTabKey} />

      {linkPending && (
        <Banner
          tone="info"
          icon={<span className="material-symbols-outlined text-sm" aria-hidden="true">link</span>}
          action={
            onCancelLink && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onCancelLink} className="shrink-0 rounded-md border border-info-200 bg-white px-2 py-0.5 text-info-700 hover:bg-info-100">
                ביטול
              </button>
            )
          }
        >
          {from?.text && (
            <>
              נבחר: «<b>{from.text}</b>»{from.streamHe ? ` (${from.streamHe})` : ''}.{' '}
            </>
          )}
          {sameTab
            ? 'בחרו עכשיו את המילה המקבילה בזרם השני (לחצו על הלשונית שלו), ואז לחצו שוב על "קישור" (Ctrl+K)'
            : 'סמנו כאן את המילה המקבילה, ואז לחצו שוב על "קישור" (Ctrl+K)'}
          {' · Esc לביטול'}
          {onOtherPage && <OtherPageButtons page={view?.page} onOtherPage={onOtherPage} />}
        </Banner>
      )}

      {recheckCount > 0 && (
        <Banner tone="warn" icon={<span className="material-symbols-outlined text-sm" aria-hidden="true">warning</span>}>
          {recheckCount === 1 ? 'שורה אחת זוהתה מחדש ומסומנת בצהוב' : `${recheckCount} שורות זוהו מחדש ומסומנות בצהוב`} — בדקו אותן מול הסריקה
        </Banner>
      )}

      {allApproved && (
        <Banner
          tone="ok"
          icon={<span className="material-symbols-outlined text-sm" aria-hidden="true">check_circle</span>}
          action={
            nextOpen && setTabKey ? (
              <button type="button" onClick={() => setTabKey(nextOpen.key)} className="shrink-0 rounded-md border border-success-200 bg-white px-2 py-0.5 text-success-800 hover:bg-success-100">
                ללשונית «{nextOpen.he}»
              </button>
            ) : null
          }
        >
          כל הפסקאות בזרם אושרו
        </Banner>
      )}

      <div data-proof-text-scroll="" className="min-h-0 flex-1 overflow-y-auto px-3 py-2" style={textStyle}>
        {editorSlot}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-surface-variant px-3 py-1 text-[11px] text-on-surface/60">
        <p className="min-w-[12rem] flex-1 truncate" title={readOnly ? hint : `${hint}\n${TEXT_HINT_LEGEND}`}>
          {hint}
        </p>
        <Legend />
      </div>
    </section>
  )
}
