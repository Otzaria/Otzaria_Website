'use client'

import { useState } from 'react'
import { PARA_STYLES, CHAR_STYLES, SCRIPTS, CERTAINTY } from '@/lib/pageProof/vocab'

// כרטיסיית "שורה": כל תיוגי-השורה על השורות הנבחרות (אחת או יותר), סגנונות-תו
// לטווח-המילים הנבחר, ומה המערכת חשבה (pred) — כדי שהמתייג רק יתקן.

const btn = 'rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-40'
const soft = `${btn} bg-surface-variant/60 hover:bg-surface-variant`

export function Section({ title, children, hint }) {
  return (
    <section className="border-b border-surface-variant py-3">
      <h3 className="mb-2 text-sm font-bold text-on-surface/80" title={hint}>{title}</h3>
      {children}
    </section>
  )
}

function PredCard({ line }) {
  const pred = line?.pred || {}
  const keys = Object.keys(pred)
  if (!keys.length) return null
  const show = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))
  return (
    <Section title="מה המערכת חשבה" hint="הניחוש, הביטחון והנימוק — נשמרים גם כשמתקנים">
      <dl className="space-y-1 text-xs">
        {keys.map((k) => (
          <div key={k} className="rounded bg-surface-variant/40 px-2 py-1">
            <dt className="font-bold">
              {k}: <span className="font-normal">{show(pred[k].v)}</span>
              {typeof pred[k].conf === 'number' && <span className="text-on-surface/50"> · {Math.round(pred[k].conf * 100)}%</span>}
            </dt>
            {pred[k].why && <dd className="text-on-surface/60">{pred[k].why}</dd>}
          </div>
        ))}
      </dl>
    </Section>
  )
}

export default function LineTab({ lines, streams, wordRange, readOnly, mode, act }) {
  const [why, setWhy] = useState('')
  const n = lines.length
  if (!n) {
    return (
      <div className="py-6 text-center text-sm text-on-surface/60">
        בחרו שורה — בטקסט או בסריקה (Shift/Ctrl = כמה שורות, גרירה על הסריקה = בחירה באזור)
      </div>
    )
  }
  const one = n === 1 ? lines[0] : null
  const locked = readOnly || lines.some((l) => l._new)
  const same = (f) => (lines.every((l) => l[f] === lines[0][f]) ? lines[0][f] : null)
  const curStream = same('stream')
  const base = curStream ? curStream.replace(/_heading$/, '') : null
  const isHeading = curStream?.endsWith('_heading')

  const styleOn = (st) => {
    if (!one || !wordRange) return false
    const [lo, hi] = wordRange
    return (one.words || []).slice(lo, hi + 1).every((w) => (w.styles || []).includes(st))
  }
  const pick = (on) => `${btn} ${on ? 'bg-primary text-on-primary' : 'bg-surface-variant/60 hover:bg-surface-variant'}`

  return (
    <div className="text-on-surface">
      <div className="py-2 text-sm font-bold">
        {one ? `שורה ${one.id > 0 ? (one.line_no ?? 0) + 1 : '(חדשה)'}` : `${n} שורות נבחרו`}
        {locked && !readOnly && <span className="mr-2 text-xs font-normal text-info-700">שורה חדשה — נערכת אחרי הקליטה אצל בעל הפרויקט</span>}
      </div>

      <Section title="זרם (מקשים 1–9)">
        <div className="flex flex-wrap gap-1">
          {streams.map((s, i) => (
            <button
              key={s.key}
              disabled={locked}
              onClick={() => act.stream(isHeading ? `${s.key}_heading` : s.key)}
              className={`${btn} border-2 font-bold`}
              style={{ borderColor: s.color, background: base === s.key ? s.color : 'transparent', color: base === s.key ? '#fff' : s.color }}
              title={i < 9 ? `מקש ${i + 1}` : ''}
            >
              {i < 9 ? `${i + 1} · ` : ''}
              {s.he}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={locked || !base} checked={!!isHeading} onChange={(e) => act.stream(e.target.checked ? `${base}_heading` : base)} />
          כותרת של הזרם (למשל &quot;הערות&quot; בראש מדור-ההערות)
        </label>
      </Section>

      <Section title="פסקה">
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={locked} checked={!!same('para_start')} onChange={(e) => act.paraStart(e.target.checked)} />
          תחילת פסקה
        </label>
        <select
          disabled={locked}
          value={same('para_style') || ''}
          onChange={(e) => e.target.value && act.para(e.target.value)}
          className="w-full rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
        >
          <option value="">סגנון-פסקה…</option>
          {Object.entries(PARA_STYLES).map(([k, v]) => (
            <option key={k} value={k}>{v.he}</option>
          ))}
        </select>
      </Section>

      {one && (
        <Section title="סגנון-תו" hint="בחרו מילה בטקסט (Shift = טווח), ואז סגנון">
          {!wordRange ? (
            <p className="text-xs text-on-surface/60">לחצו על מילה בשורה הנבחרת (Shift+לחיצה = טווח מילים)</p>
          ) : (
            <>
              <p className="mb-1 text-xs text-on-surface/60">מילים {wordRange[0] + 1}–{wordRange[1] + 1}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(CHAR_STYLES).map(([k, v]) => {
                  const on = styleOn(k)
                  return (
                    <button key={k} disabled={locked} onClick={() => act.style(k, !on)} className={pick(on)}>
                      {v.he}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </Section>
      )}

      <Section title="כתב">
        <div className="flex flex-wrap gap-1">
          {Object.entries(SCRIPTS).map(([k, v]) => (
            <button key={k} disabled={locked} onClick={() => act.script(k)} className={pick(same('script') === k)}>
              {v}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={locked} checked={lines.every((l) => l.flags?.mixed_line)} onChange={(e) => act.mixed(e.target.checked)} />
          שורה מעורבת-כתבים
        </label>
      </Section>

      <Section title="ודאות" hint="עדיף סימון-עמימות על ניחוש — הלמידה מתעלמת מעמומים">
        <div className="flex flex-wrap gap-1">
          {Object.entries(CERTAINTY).map(([k, v]) => (
            <button
              key={k}
              disabled={locked || (k === 'ambiguous' && !why.trim())}
              onClick={() => act.certainty(k, k === 'ambiguous' ? why.trim() : null)}
              className={pick(same('certainty') === k)}
            >
              {v}
            </button>
          ))}
        </div>
        <input
          value={why}
          disabled={locked}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={300}
          placeholder='למה לא בטוח? (חובה ל"לא בטוח")'
          className="mt-2 w-full rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
        />
      </Section>

      <Section title="השורה עצמה">
        <div className="flex flex-wrap gap-1">
          <button disabled={locked} onClick={act.lineOk} className={`${btn} bg-success-100 text-success-800 hover:bg-success-200`} title="בדקתי — הטקסט נכון כפי שהוא">
            ✓ נכונה כפי שהיא
          </button>
          {lines.some((l) => l.status === 'removed') ? (
            <button disabled={readOnly} onClick={act.restore} className={soft}>שחזור</button>
          ) : (
            <button disabled={locked} onClick={act.remove} className={soft} title="תיבה שאינה שורת-טקסט (כתם, קישוט) — Delete">
              לא-שורה (הסרה)
            </button>
          )}
          {one && !one._new && (
            <>
              <button disabled={readOnly} onClick={() => act.mode(mode === 'bbox' ? 'select' : 'bbox')} className={pick(mode === 'bbox')}>
                תיקון תיבה
              </button>
              <button disabled={readOnly} onClick={() => act.mode(mode === 'split' ? 'select' : 'split')} className={pick(mode === 'split')} title="לחצו על הסריקה במקום הפיצול (שורה שחוצה שני טורים)">
                פיצול
              </button>
            </>
          )}
          {n === 2 && !locked && (
            <>
              <button onClick={act.merge} className={soft} title="שני חצאים של אותה שורה">איחוד השתיים</button>
              <button onClick={act.link} className={soft} title="ההערה (או הד״ה) והשורה שהיא מפרשת">קישור ביניהן</button>
            </>
          )}
        </div>
        {mode === 'split' && <p className="mt-1 text-xs text-info-700">לחצו על הסריקה, בתוך השורה, במקום שבו יש לפצל</p>}
        {mode === 'bbox' && <p className="mt-1 text-xs text-info-700">גררו את פינות התיבה על הסריקה</p>}
      </Section>

      {one && <PredCard line={one} />}
    </div>
  )
}
