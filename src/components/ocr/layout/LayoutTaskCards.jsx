'use client'

import { useState, useEffect, useMemo } from 'react'
import PageCanvas, { streamColor } from './PageCanvas'
import { parsePageNumber } from '@/lib/ocr/gematria'
import { confirmedAnswerFromPrefill } from '@/lib/ocr/layoutValidation'

// כרטיסי המיקרו-שאלות של תיוג מבנה-עמוד — משותפים לדף המתנדב ולעריכת מנהל.
// חוזה מול האב: value = null (טרם הוכרע) | { confirmed:true, answer:null }
// ("המכונה צדקה") | { confirmed:false, answer:{...} } (הכרעה מתוקנת).
// האב שומר value לכל משימה ושולח אותם יחד בשמירה.

function ChoiceButton({ active, onClick, icon, children, tone = 'success' }) {
  const activeCls =
    tone === 'success'
      ? 'bg-success-600 text-white border-success-600'
      : 'bg-neutral-700 text-white border-neutral-700'
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all flex items-center gap-1 ${
        active ? activeCls : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-500'
      }`}
    >
      {icon && <span className="material-symbols-outlined text-sm">{icon}</span>}
      {children}
    </button>
  )
}

// ===== מספר עמוד =====
// מוצג: חיתוך מוגדל של רצועת המספר + הערך הצפוי. המתנדב: "נכון" / הקלדה /
// "אין מספר עמוד". ולידציה חיה של גימטריה/ספרות.
export function PagenumTaskCard({ prefill, imgSrc, value, onChange }) {
  const typed = !value?.confirmed && typeof value?.answer?.value === 'string' ? value.answer.value : ''
  const parsed = useMemo(() => (typed ? parsePageNumber(typed) : null), [typed])
  const cwChosen = !value?.confirmed && value?.answer?.catchword === true
  const noneChosen = !value?.confirmed && value?.answer && value.answer.value === null && !cwChosen

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-on-surface font-bold">
        <span className="material-symbols-outlined text-info-600">tag</span>
        מה מספר העמוד?
      </div>

      {imgSrc && (
        <div className="bg-white border border-neutral-200 rounded-lg p-2 flex items-center justify-center">
          <img src={imgSrc} alt="רצועת מספר העמוד" className="max-h-32 w-full object-contain" draggable={false} />
        </div>
      )}

      <div className="text-sm text-on-surface/70">
        הערך הצפוי מהרצף: <span className="font-bold text-lg text-on-surface">{prefill.hebrew || prefill.expected}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ChoiceButton
          active={!!value?.confirmed}
          onClick={() => onChange({ confirmed: true, answer: null })}
          icon="check"
        >
          נכון — זה מה שכתוב
        </ChoiceButton>

        <div className="flex items-center gap-1">
          <input
            dir="rtl"
            value={typed}
            onChange={(e) => {
              const v = e.target.value
              onChange(v.trim() ? { confirmed: false, answer: { value: v.trim() } } : null)
            }}
            placeholder="הערך הנכון (גימטריה או ספרות)"
            className={`border rounded-lg px-3 py-1.5 text-sm w-56 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              typed && parsed === null ? 'border-danger-400' : 'border-neutral-300'
            }`}
          />
          {typed && (
            <span className={`text-xs font-bold ${parsed === null ? 'text-danger-600' : 'text-success-700'}`}>
              {parsed === null ? 'לא תקין' : `= ${parsed}`}
            </span>
          )}
        </div>

        <ChoiceButton
          active={noneChosen}
          onClick={() => onChange({ confirmed: false, answer: { value: null } })}
          icon="block"
          tone="neutral"
        >
          אין מספר עמוד
        </ChoiceButton>

        <ChoiceButton
          active={cwChosen}
          onClick={() => onChange({ confirmed: false, answer: { value: null, catchword: true } })}
          icon="skip_next"
          tone="neutral"
        >
          זו מילה — שומר-דף
        </ChoiceButton>
      </div>

      <div className="text-xs text-on-surface/50">
        אם בתמונה מופיעה <b>מילה</b> ולא מספר — זהו &quot;שומר-דף&quot;: המילה הראשונה של
        העמוד הבא, שהודפסה בתחתית העמוד. סמנו &quot;זו מילה — שומר-דף&quot;.
      </div>
    </div>
  )
}

// ===== כותרת רצה =====
// מוצג: הרצועה העליונה עם התיבה המזוהה. המתנדב: "נכון" / גרירת תיבה
// מתוקנת (או ציור כשאין) / "אין כותרת בעמוד".
export function HeaderTaskCard({ prefill, imageUrl, imageWidth, imageHeight, value, onChange }) {
  // התיבה המוצגת: מאושרת = ה-prefill; מתוקנת = התשובה; טרם הוכרע = ה-prefill
  const shownBox = value?.confirmed
    ? prefill.box
    : value
      ? value.answer.box
      : prefill.box

  // הרצועה העליונה בלבד — אותו חישוב כמו בצד השרת (headerCrop)
  const clipHeight = useMemo(() => {
    let bottom = 0.2 * imageHeight
    if (prefill.y_band) bottom = Math.max(bottom, (prefill.y_band[1] + 0.05) * imageHeight)
    const b = shownBox || prefill.box
    if (b) bottom = Math.max(bottom, b.y + b.height + 0.04 * imageHeight)
    return Math.min(imageHeight, Math.round(bottom))
  }, [imageHeight, prefill, shownBox])

  const noneChosen = !value?.confirmed && value?.answer && value.answer.box === null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-on-surface font-bold">
        <span className="material-symbols-outlined text-warning-alt-600">title</span>
        האם זו הכותרת הרצה?
      </div>

      {prefill.texts?.length > 0 && (
        <div className="text-sm text-on-surface/70">
          נוסח הכותרת בספר: <span className="font-bold text-on-surface">{prefill.texts[0]}</span>
        </div>
      )}

      <PageCanvas
        imageUrl={imageUrl}
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        clipHeight={clipHeight}
        headerBox={noneChosen ? null : shownBox || null}
        headerDrawable
        onHeaderBoxChange={(box) => onChange({ confirmed: false, answer: { box } })}
      />
      <div className="text-xs text-on-surface/50">
        {shownBox && !noneChosen
          ? 'אפשר לגרור את התיבה למקום הנכון, ולשנות את גודלה מהפינה'
          : 'אין תיבה — גררו על התמונה כדי לצייר את תיבת הכותרת'}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {prefill.box && (
          <ChoiceButton
            active={!!value?.confirmed}
            onClick={() => onChange({ confirmed: true, answer: null })}
            icon="check"
          >
            נכון — התיבה במקום
          </ChoiceButton>
        )}
        <ChoiceButton
          active={noneChosen}
          onClick={() => onChange({ confirmed: false, answer: { box: null } })}
          icon="block"
          tone="neutral"
        >
          אין כותרת בעמוד
        </ChoiceButton>
        {value && !value.confirmed && value.answer.box && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-info-600 hover:bg-info-50 px-2 py-1 rounded-lg transition-colors"
          >
            אתחול לזיהוי המכונה
          </button>
        )}
      </div>
    </div>
  )
}

// ===== חלוקת זרמים =====
// מוצג: העמוד המלא עם פסי-רוחב צבעוניים ומקרא זרמי-הספר. המתנדב: גרירת
// גבולות, פיצול/מיזוג רצועות ובחירת זהות לכל רצועה. "נכון" כשהחלוקה טובה.
export function StreamsTaskCard({ prefill, imageUrl, imageWidth, imageHeight, value, onChange }) {
  const bands = value?.confirmed || !value ? prefill.bands : value.answer.bands

  const setBands = (next) => onChange({ confirmed: false, answer: { bands: next } })

  const splitBand = (i) => {
    const b = bands[i]
    // רצועה דקה מדי לפיצול — שתי המחציות היו נופלות מתחת למינימום הוולידציה
    if (b.y1 - b.y0 < 0.02) return
    const mid = (b.y0 + b.y1) / 2
    const next = [
      ...bands.slice(0, i),
      { ...b, y1: mid },
      { y0: mid, y1: b.y1, book_stream: null },
      ...bands.slice(i + 1),
    ]
    setBands(next)
  }

  const removeBand = (i) => {
    if (bands.length <= 1) return
    setBands(bands.filter((_, j) => j !== i))
  }

  // "הוסף רצועה" גלוי — חיוני כשזוהה זרם אחד בלבד ובעמוד יש שניים:
  // מפצל את הרצועה הגבוהה ביותר, ואת הגבול גוררים למקום הנכון
  const addBand = () => {
    let tallest = 0
    for (let j = 1; j < bands.length; j++) {
      if (bands[j].y1 - bands[j].y0 > bands[tallest].y1 - bands[tallest].y0) tallest = j
    }
    splitBand(tallest)
  }

  const setIdentity = (i, id) => {
    setBands(bands.map((b, j) => (j === i ? { ...b, book_stream: id } : b)))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-on-surface font-bold">
        <span className="material-symbols-outlined text-success-600">view_agenda</span>
        חלוקת הזרמים בעמוד
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-2/3">
          <PageCanvas
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            bands={bands}
            onBandsChange={setBands}
          />
        </div>

        {/* מקרא ופעולות לכל רצועה */}
        <div className="lg:w-1/3 flex flex-col gap-2">
          <div className="text-xs text-on-surface/50">
            גררו את הגבולות האופקיים על העמוד; לכל רצועה בחרו את זהות הזרם מהמקרא.
          </div>
          {bands.map((b, i) => (
            <div key={i} className="bg-white border border-neutral-200 rounded-lg p-2 flex items-center gap-2 flex-wrap">
              <span
                className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                style={{ backgroundColor: streamColor(b.book_stream) }}
              >
                {i + 1}
              </span>
              <select
                dir="rtl"
                value={b.book_stream === null || b.book_stream === undefined ? '' : String(b.book_stream)}
                onChange={(e) => setIdentity(i, e.target.value === '' ? null : parseInt(e.target.value, 10))}
                className="border border-neutral-300 rounded-lg px-2 py-1 text-sm bg-white flex-1 min-w-28"
              >
                <option value="">לא משויך</option>
                {prefill.legend.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="flex gap-1">
                <button
                  onClick={() => splitBand(i)}
                  className="text-info-600 hover:bg-info-50 p-1 rounded-lg transition-colors"
                  title="פיצול הרצועה לשתיים (הוספת גבול)"
                >
                  <span className="material-symbols-outlined text-sm">splitscreen</span>
                </button>
                <button
                  onClick={() => removeBand(i)}
                  disabled={bands.length <= 1}
                  className="text-danger-600 hover:bg-danger-50 p-1 rounded-lg transition-colors disabled:opacity-30"
                  title="הסרת הרצועה (הסרת גבול)"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </span>
            </div>
          ))}

          <button
            onClick={addBand}
            className="border border-dashed border-info-400 text-info-700 hover:bg-info-50 rounded-lg px-2 py-1.5 text-sm font-bold flex items-center justify-center gap-1 transition-colors"
            title="מוסיף גבול חדש (מפצל את הרצועה הגדולה) — גררו אותו למקום הנכון"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            הוסף רצועה — יש עוד זרם בעמוד
          </button>

          <div className="flex items-center gap-2 flex-wrap mt-1">
            <ChoiceButton
              active={!!value?.confirmed}
              onClick={() => onChange({ confirmed: true, answer: null })}
              icon="check"
            >
              נכון — החלוקה טובה
            </ChoiceButton>
            {value && !value.confirmed && (
              <button
                onClick={() => onChange(null)}
                className="text-xs text-info-600 hover:bg-info-50 px-2 py-1 rounded-lg transition-colors"
              >
                אתחול לחלוקת המכונה
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== עמוד מלא (7 המהדורות הקשות) =====
// שילוב 1-3 במסך אחד: אותו canvas, כל השכבות. מנהל תתי-הכרעות פנימיות
// ומדווח לאב תשובה מלאה רק כשכל הרכיבים הוכרעו.
export function ZonesFullCard({ prefill, imageUrl, pagenumImgSrc, imageWidth, imageHeight, value, onChange }) {
  const [parts, setParts] = useState({ pagenum: null, header: null, streams: null })

  // "הכול נכון" מהאב (confirmed ברמת העמוד) — משתקף בתתי-הרכיבים
  useEffect(() => {
    if (value?.confirmed) {
      setParts({
        pagenum: prefill.pagenum ? { confirmed: true, answer: null } : null,
        header: prefill.header ? { confirmed: true, answer: null } : null,
        streams: prefill.streams ? { confirmed: true, answer: null } : null,
      })
    } else if (!value) {
      setParts({ pagenum: null, header: null, streams: null })
    } else if (value.answer) {
      // עמוד שכבר תויג (סקירת/עריכת מנהל): טוענים את התשובות הקיימות
      // לתתי-הכרטיסים, אחרת הם מוצגים ריקים
      setParts({
        pagenum: prefill.pagenum && value.answer.pagenum ? { confirmed: false, answer: value.answer.pagenum } : null,
        header: prefill.header && value.answer.header ? { confirmed: false, answer: value.answer.header } : null,
        streams: prefill.streams && value.answer.streams ? { confirmed: false, answer: value.answer.streams } : null,
      })
    }
    // רק שינוי חיצוני (איפוס/אישור-הכול/טעינת-תשובות) מעניין אותנו — לא כל עדכון פנימי
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.confirmed, value === null])

  const setPart = (key, v) => {
    const next = { ...parts, [key]: v }
    setParts(next)

    // כל הרכיבים שבשאלה הוכרעו? מדווחים תשובה מלאה וממומשת לאב
    const needed = ['pagenum', 'header', 'streams'].filter((k) => prefill[k])
    if (needed.every((k) => next[k])) {
      const answer = {}
      for (const k of needed) {
        answer[k] = next[k].confirmed
          ? confirmedAnswerFromPrefill(k, prefill[k])
          : next[k].answer
      }
      onChange({ confirmed: false, answer })
    } else {
      onChange(null)
    }
  }

  // הרצועות/תיבה המוצגות על הקנבס המשולב
  const shownBands = prefill.streams
    ? (parts.streams && !parts.streams.confirmed ? parts.streams.answer.bands : prefill.streams.bands)
    : null
  const headerNone = parts.header && !parts.header.confirmed && parts.header.answer.box === null
  const shownHeaderBox = prefill.header
    ? (headerNone ? null : parts.header && !parts.header.confirmed ? parts.header.answer.box : prefill.header.box)
    : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-on-surface font-bold">
        <span className="material-symbols-outlined text-primary">grid_view</span>
        עמוד מלא — כותרת, מספר וזרמים על אותו קנבס
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-2/3">
          <PageCanvas
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            bands={shownBands}
            onBandsChange={
              prefill.streams
                ? (next) => setPart('streams', { confirmed: false, answer: { bands: next } })
                : null
            }
            headerBox={shownHeaderBox}
            headerDrawable={!!prefill.header}
            onHeaderBoxChange={
              prefill.header
                ? (box) => setPart('header', { confirmed: false, answer: { box } })
                : null
            }
            markers={prefill.pagenum?.box ? [{ box: prefill.pagenum.box, color: '#dc2626' }] : []}
          />
        </div>

        <div className="lg:w-1/3 flex flex-col gap-4">
          {prefill.pagenum && (
            <div className="glass rounded-xl p-3">
              <PagenumTaskCard
                prefill={prefill.pagenum}
                imgSrc={pagenumImgSrc}
                value={parts.pagenum}
                onChange={(v) => setPart('pagenum', v)}
              />
            </div>
          )}

          {prefill.header && (
            <div className="glass rounded-xl p-3 flex flex-col gap-2">
              <div className="font-bold text-sm text-on-surface flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-warning-alt-600">title</span>
                כותרת רצה (התיבה הכתומה)
              </div>
              {prefill.header.texts?.length > 0 && (
                <div className="text-xs text-on-surface/70">נוסח: {prefill.header.texts[0]}</div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {prefill.header.box && (
                  <ChoiceButton
                    active={!!parts.header?.confirmed}
                    onClick={() => setPart('header', { confirmed: true, answer: null })}
                    icon="check"
                  >
                    נכון
                  </ChoiceButton>
                )}
                <ChoiceButton
                  active={headerNone}
                  onClick={() => setPart('header', { confirmed: false, answer: { box: null } })}
                  icon="block"
                  tone="neutral"
                >
                  אין כותרת
                </ChoiceButton>
              </div>
            </div>
          )}

          {prefill.streams && (
            <div className="glass rounded-xl p-3 flex flex-col gap-2">
              <div className="font-bold text-sm text-on-surface flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-success-600">view_agenda</span>
                זרמים (הרצועות הצבעוניות)
              </div>
              {(shownBands || []).map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                    style={{ backgroundColor: streamColor(b.book_stream) }}
                  >
                    {i + 1}
                  </span>
                  <select
                    dir="rtl"
                    value={b.book_stream === null || b.book_stream === undefined ? '' : String(b.book_stream)}
                    onChange={(e) => {
                      const id = e.target.value === '' ? null : parseInt(e.target.value, 10)
                      const next = (shownBands || []).map((x, j) => (j === i ? { ...x, book_stream: id } : x))
                      setPart('streams', { confirmed: false, answer: { bands: next } })
                    }}
                    className="border border-neutral-300 rounded-lg px-2 py-0.5 text-xs bg-white flex-1"
                  >
                    <option value="">לא משויך</option>
                    {prefill.streams.legend.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (b.y1 - b.y0 < 0.02) return
                      const mid = (b.y0 + b.y1) / 2
                      const next = [
                        ...shownBands.slice(0, i),
                        { ...b, y1: mid },
                        { y0: mid, y1: b.y1, book_stream: null },
                        ...shownBands.slice(i + 1),
                      ]
                      setPart('streams', { confirmed: false, answer: { bands: next } })
                    }}
                    className="text-info-600 hover:bg-info-50 p-0.5 rounded transition-colors"
                    title="פיצול הרצועה לשתיים"
                  >
                    <span className="material-symbols-outlined text-sm">splitscreen</span>
                  </button>
                  <button
                    onClick={() =>
                      shownBands.length > 1 &&
                      setPart('streams', {
                        confirmed: false,
                        answer: { bands: shownBands.filter((_, j) => j !== i) },
                      })
                    }
                    disabled={(shownBands || []).length <= 1}
                    className="text-danger-600 hover:bg-danger-50 p-0.5 rounded transition-colors disabled:opacity-30"
                    title="הסרת הרצועה"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const bands = shownBands || []
                  if (!bands.length) return
                  let t = 0
                  for (let j = 1; j < bands.length; j++) {
                    if (bands[j].y1 - bands[j].y0 > bands[t].y1 - bands[t].y0) t = j
                  }
                  const b = bands[t]
                  if (b.y1 - b.y0 < 0.02) return
                  const mid = (b.y0 + b.y1) / 2
                  const next = [
                    ...bands.slice(0, t),
                    { ...b, y1: mid },
                    { y0: mid, y1: b.y1, book_stream: null },
                    ...bands.slice(t + 1),
                  ]
                  setPart('streams', { confirmed: false, answer: { bands: next } })
                }}
                className="border border-dashed border-info-400 text-info-700 hover:bg-info-50 rounded-lg px-2 py-1 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                title="מוסיף גבול חדש (מפצל את הרצועה הגדולה) — גררו אותו למקום הנכון"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                הוסף רצועה — יש עוד זרם בעמוד
              </button>
              <ChoiceButton
                active={!!parts.streams?.confirmed}
                onClick={() => setPart('streams', { confirmed: true, answer: null })}
                icon="check"
              >
                החלוקה נכונה
              </ChoiceButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
