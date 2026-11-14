'use client'

import { useState, useEffect, useMemo } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import SelectMenu from '@/components/ui/SelectMenu'
import { cx } from '@/components/ui/cx'
import { fieldClasses } from '@/components/ui/fieldStyles'
import PageCanvas, { streamColor } from './PageCanvas'
import { bandInk } from './bandInk'
import { parsePageNumber } from '@/lib/ocr/gematria'
import {
  splitBandAt,
  removeBandAt,
  splitTallestBand,
  setBandIdentity,
  derivePartsFromValue,
  buildZonesFullAnswer,
} from '@/lib/ocr/layoutBands'

// כרטיסי המיקרו-שאלות של תיוג מבנה-עמוד — משותפים לדף המתנדב ולעריכת מנהל.
// חוזה מול האב: value = null (טרם הוכרע) | { confirmed:true, answer:null }
// ("המכונה צדקה") | { confirmed:false, answer:{...} } (הכרעה מתוקנת).
// האב שומר value לכל משימה ושולח אותם יחד בשמירה.

// כפתור בחירה (aria-pressed): ui/Button שקט, והבחירה הנוכחית במילוי רך — המשמעות בטקסט, לא בצבע
function ChoiceButton({ active, onClick, icon, children }) {
  return (
    <Button variant="text" size="sm" icon={icon} aria-pressed={!!active} onClick={onClick}>
      {children}
    </Button>
  )
}

// כותרת של משימה: אייקון וטקסט
function TaskTitle({ icon, children, small = false }) {
  return (
    <div className={cx('flex items-center gap-2 text-on-surface', small ? 'text-title-sm' : 'text-title-md')}>
      <AppIcon name={icon} className={cx('text-primary', small ? 'text-icon-sm' : 'text-icon-md')} />
      {children}
    </div>
  )
}

// מספר הרצועה על צבע הזרם (צבע נתונים מ-PageCanvas, זהה לרצועה בתמונה — ולכן גם הספרה קבועה בשתי
// הערכות: לבן או שחור, לפי הניגודיות — bandInk.js)
function BandNumber({ n, stream, small = false }) {
  const bg = streamColor(stream)
  return (
    <span
      className={cx('flex shrink-0 items-center justify-center rounded-full text-label-sm', small ? 'size-5' : 'size-6')}
      style={{ backgroundColor: bg, color: bandInk(bg).color }}
    >
      {n}
    </span>
  )
}

// בורר זהות הזרם לרצועה (ui/SelectMenu); '' = לא משויך
function StreamSelect({ index, value, legend, onChange }) {
  return (
    <SelectMenu
      label={`הזרם של רצועה ${index + 1}`}
      hideLabel
      options={legend.map((s) => ({ value: String(s.id), label: s.label }))}
      value={value === null || value === undefined ? '' : String(value)}
      allLabel="לא משויך"
      placeholder="לא משויך"
      searchable={legend.length > 8}
      highlight={false}
      onChange={(v) => onChange(v === '' || v == null ? null : parseInt(v, 10))}
      className="min-w-28 flex-1"
    />
  )
}

const HINT = 'text-body-sm text-on-surface-variant'
const SUBCARD = 'flex flex-col gap-2 rounded-(--radius-control) bg-surface-container-low p-3'

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
      <TaskTitle icon="tag">מה מספר העמוד?</TaskTitle>

      {imgSrc && (
        <div className="flex items-center justify-center rounded-(--radius-control) bg-surface-container-low p-2">
          <img src={imgSrc} alt="רצועת מספר העמוד" className="max-h-32 w-full object-contain" draggable={false} />
        </div>
      )}

      <div className="text-body-md text-on-surface-variant">
        המספר הצפוי לפי העמודים הקודמים: <span className="text-title-md text-on-surface">{prefill.hebrew || prefill.expected}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ChoiceButton
          active={!!value?.confirmed}
          onClick={() => onChange({ confirmed: true, answer: null })}
          icon="check"
        >
          נכון — זה מה שכתוב
        </ChoiceButton>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <input
            dir="rtl"
            value={typed}
            onChange={(e) => {
              const v = e.target.value
              onChange(v.trim() ? { confirmed: false, answer: { value: v.trim() } } : null)
            }}
            placeholder="הערך הנכון (גימטריה או ספרות)"
            aria-label="הערך הנכון"
            aria-invalid={typed && parsed === null ? true : undefined}
            className={fieldClasses({ invalid: !!typed && parsed === null, className: 'w-56 max-w-full' })}
          />
          {typed && (
            <span className={cx('text-label-md', parsed === null ? 'text-error' : 'text-success')}>
              {/* מה שהוקלד, כמספר — כך רואים שהגימטריה נקראה נכון ("קכג" ← 123) */}
              {parsed === null ? 'לא מספר עמוד תקין' : `המספר: ${parsed}`}
            </span>
          )}
        </div>

        <ChoiceButton
          active={noneChosen}
          onClick={() => onChange({ confirmed: false, answer: { value: null } })}
          icon="block"
        >
          אין מספר עמוד
        </ChoiceButton>

        <ChoiceButton
          active={cwChosen}
          onClick={() => onChange({ confirmed: false, answer: { value: null, catchword: true } })}
          icon="skip_next"
        >
          זו מילה — שומר-דף
        </ChoiceButton>
      </div>

      <div className={HINT}>
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
      <TaskTitle icon="title">האם זו הכותרת הרצה?</TaskTitle>

      {prefill.texts?.length > 0 && (
        <div className="text-body-md text-on-surface-variant">
          נוסח הכותרת בספר: <span className="text-label-lg text-on-surface">{prefill.texts[0]}</span>
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
      <div className={HINT}>
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
        >
          אין כותרת בעמוד
        </ChoiceButton>
        {value && !value.confirmed && value.answer.box && (
          <Button variant="text" size="sm" icon="undo" onClick={() => onChange(null)}>
            חזרה להצעה המקורית
          </Button>
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
    const next = splitBandAt(bands, i)
    if (next) setBands(next)
  }

  const removeBand = (i) => {
    const next = removeBandAt(bands, i)
    if (next) setBands(next)
  }

  // "הוסף רצועה" גלוי — חיוני כשזוהה זרם אחד בלבד ובעמוד יש שניים:
  // מפצל את הרצועה הגבוהה ביותר, ואת הגבול גוררים למקום הנכון
  const addBand = () => {
    const next = splitTallestBand(bands)
    if (next) setBands(next)
  }

  const setIdentity = (i, id) => {
    setBands(setBandIdentity(bands, i, id))
  }

  return (
    <div className="flex flex-col gap-3">
      <TaskTitle icon="view_agenda">חלוקת הזרמים בעמוד</TaskTitle>

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
          <div className={HINT}>
            גררו את הגבולות האופקיים על העמוד; לכל רצועה בחרו את זהות הזרם מהמקרא.
          </div>
          {bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-(--radius-control) bg-surface-container-low p-2">
              <BandNumber n={i + 1} stream={b.book_stream} />
              <StreamSelect index={i} value={b.book_stream} legend={prefill.legend} onChange={(id) => setIdentity(i, id)} />
              <span className="flex">
                <Button variant="text" size="sm" icon="splitscreen" iconOnly aria-label={`פיצול רצועה ${i + 1} לשתיים`} title="פיצול הרצועה לשתיים (הוספת גבול)" onClick={() => splitBand(i)} />
                <Button variant="text" size="sm" icon="delete" iconOnly aria-label={`הסרת רצועה ${i + 1}`} title="הסרת הרצועה (הסרת גבול)" disabled={bands.length <= 1} onClick={() => removeBand(i)} className="text-error" />
              </span>
            </div>
          ))}

          <Button variant="outlined" size="sm" icon="add" fullWidth onClick={addBand} title="מוסיף גבול חדש (מפצל את הרצועה הגדולה) — גררו אותו למקום הנכון">
            הוסף רצועה — יש עוד זרם בעמוד
          </Button>

          <div className="flex items-center gap-2 flex-wrap mt-1">
            <ChoiceButton
              active={!!value?.confirmed}
              onClick={() => onChange({ confirmed: true, answer: null })}
              icon="check"
            >
              נכון — החלוקה טובה
            </ChoiceButton>
            {value && !value.confirmed && (
              <Button variant="text" size="sm" icon="undo" onClick={() => onChange(null)}>
                חזרה להצעה המקורית
              </Button>
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
    const nextParts = derivePartsFromValue(value, prefill)
    if (nextParts) setParts(nextParts)
    // רק שינוי חיצוני (איפוס/אישור-הכול/טעינת-תשובות) מעניין אותנו — לא כל עדכון פנימי
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.confirmed, value === null])

  const setPart = (key, v) => {
    const next = { ...parts, [key]: v }
    setParts(next)
    // כל הרכיבים שבשאלה הוכרעו? מדווחים תשובה מלאה וממומשת לאב
    onChange(buildZonesFullAnswer(prefill, next))
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
      <TaskTitle icon="grid_view">עמוד מלא — כותרת, מספר וזרמים באותה תמונה</TaskTitle>

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
            <div className={SUBCARD}>
              <PagenumTaskCard
                prefill={prefill.pagenum}
                imgSrc={pagenumImgSrc}
                value={parts.pagenum}
                onChange={(v) => setPart('pagenum', v)}
              />
            </div>
          )}

          {prefill.header && (
            <div className={SUBCARD}>
              <TaskTitle icon="title" small>כותרת רצה (התיבה הכתומה)</TaskTitle>
              {prefill.header.texts?.length > 0 && (
                <div className={HINT}>נוסח: {prefill.header.texts[0]}</div>
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
                >
                  אין כותרת
                </ChoiceButton>
              </div>
            </div>
          )}

          {prefill.streams && (
            <div className={SUBCARD}>
              <TaskTitle icon="view_agenda" small>זרמים (הרצועות הצבעוניות)</TaskTitle>
              {(shownBands || []).map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <BandNumber n={i + 1} stream={b.book_stream} small />
                  <StreamSelect
                    index={i}
                    value={b.book_stream}
                    legend={prefill.streams.legend}
                    onChange={(id) => {
                      const next = setBandIdentity(shownBands || [], i, id)
                      setPart('streams', { confirmed: false, answer: { bands: next } })
                    }}
                  />
                  <Button
                    variant="text"
                    size="sm"
                    icon="splitscreen"
                    iconOnly
                    aria-label={`פיצול רצועה ${i + 1} לשתיים`}
                    title="פיצול הרצועה לשתיים"
                    onClick={() => {
                      const next = splitBandAt(shownBands, i)
                      if (next) setPart('streams', { confirmed: false, answer: { bands: next } })
                    }}
                  />
                  <Button
                    variant="text"
                    size="sm"
                    icon="delete"
                    iconOnly
                    aria-label={`הסרת רצועה ${i + 1}`}
                    title="הסרת הרצועה"
                    disabled={(shownBands || []).length <= 1}
                    className="text-error"
                    onClick={() => {
                      const next = removeBandAt(shownBands, i)
                      if (next) setPart('streams', { confirmed: false, answer: { bands: next } })
                    }}
                  />
                </div>
              ))}
              <Button
                variant="outlined"
                size="sm"
                icon="add"
                fullWidth
                title="מוסיף גבול חדש (מפצל את הרצועה הגדולה) — גררו אותו למקום הנכון"
                onClick={() => {
                  const next = splitTallestBand(shownBands)
                  if (next) setPart('streams', { confirmed: false, answer: { bands: next } })
                }}
              >
                הוסף רצועה — יש עוד זרם בעמוד
              </Button>
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
