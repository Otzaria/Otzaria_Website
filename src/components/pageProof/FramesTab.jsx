'use client'

import { streamInfo, FRAME_OBJECT_KINDS } from '@/lib/pageProof/vocab'
import { Section } from './LineTab'

// כרטיסיית "מסגרות" — הכלי הראשי לתיוג זרמים (מדריך-התיוג §3): מסגרת = חתיכה
// רציפה אחת של זרם אחד; שני טורים = שתי מסגרות באותו זרם (ימין 1, שמאל 2).

const btn = 'rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-40'

const RULES = [
  'מתחילים מ"מסגרות מהזיהוי" ומתקנים — בדרך כלל לא מציירים מאפס.',
  'טקסט בשני טורים: שתי מסגרות באותו זרם — ימין = 1, שמאל = 2.',
  'הערות בתחתית: מסגרת בזרם הערות (מדור שני — הערות ב\').',
  'כותרת-רצה, מספר-עמוד, שומר-דף: כותרת עמוד / תחתית (ריהוט).',
  'שורה שנחתכה על פני שני טורים — מחוץ למסגרות. לא מרחיבים מסגרת כדי "לתפוס" אותה.',
  'פסקה חדשה באותו זרם — לא מסגרת חדשה.',
]

export default function FramesTab({ view, streams, frameStream, setFrameStream, mode, straddleCount, readOnly, act }) {
  const frames = (view.frames || []).slice().sort((a, b) => a.order - b.order)
  const inFrames = view.lines.filter((l) => l.stream_src === 'frame').length

  const update = (fid, patch) => act.framesSet(frames.map((f) => (f.fid === fid ? { ...f, ...patch } : f)))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= frames.length) return
    const next = frames.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    act.framesSet(next.map((f, k) => ({ ...f, order: k + 1 })))
  }
  const del = (fid) => act.framesSet(frames.filter((f) => f.fid !== fid).map((f, k) => ({ ...f, order: k + 1 })))

  return (
    <div className="text-on-surface">
      <div className="py-2 text-sm">
        <b>{frames.length}</b> מסגרות · <b>{inFrames}</b> שורות תויגו במסגרות
        {straddleCount > 0 && <span className="mr-2 text-danger-700">· {straddleCount} בולטות</span>}
      </div>

      <Section title="ציור">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            disabled={readOnly}
            onClick={() => act.mode(mode === 'frame' ? 'select' : 'frame')}
            className={`${btn} ${mode === 'frame' ? 'bg-primary text-on-primary' : 'bg-surface-variant/60 hover:bg-surface-variant'}`}
          >
            {mode === 'frame' ? 'סיום מצב-מסגרות' : 'מצב-מסגרות'}
          </button>
          <button disabled={readOnly} onClick={act.framesAuto} className={`${btn} bg-surface-variant/60 hover:bg-surface-variant`}>
            מסגרות מהזיהוי
          </button>
          <button disabled={readOnly || !frames.length} onClick={act.framesClear} className={`${btn} bg-surface-variant/60 hover:bg-surface-variant`}>
            נקה הכול
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          הזרם של המסגרת הבאה:
          <select value={frameStream} onChange={(e) => setFrameStream(e.target.value)} className="rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm">
            {streams.map((s) => (
              <option key={s.key} value={s.key}>{s.he}</option>
            ))}
            {streams.map((s) => (
              <option key={`${s.key}_heading`} value={`${s.key}_heading`}>{s.he} — כותרת</option>
            ))}
          </select>
        </label>
        {mode === 'frame' && (
          <p className="mt-2 text-xs text-info-700">
            גררו מלבן על אזור ריק כדי לצייר (הוא מתהדק מעצמו סביב הטקסט). לחיצה על מסגרת בוחרת אותה; גרירה מזיזה; הפינות משנות גודל.
          </p>
        )}
      </Section>

      <Section title="המסגרות בעמוד (בסדר-הקריאה)">
        {!frames.length && <p className="text-xs text-on-surface/60">אין מסגרות עדיין</p>}
        <ul className="space-y-2">
          {frames.map((f, i) => {
            const s = streamInfo(view, f.stream)
            return (
              <li key={f.fid} className="rounded-md border-2 p-2 text-sm" style={{ borderColor: s.color }}>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-bold tabular-nums">{f.order}.</span>
                  <select
                    disabled={readOnly}
                    value={f.stream}
                    onChange={(e) => update(f.fid, { stream: e.target.value })}
                    className="rounded border border-surface-variant bg-surface px-1 py-0.5 text-sm"
                  >
                    {streams.map((st) => (
                      <option key={st.key} value={st.key}>{st.he}</option>
                    ))}
                    {streams.map((st) => (
                      <option key={`${st.key}_heading`} value={`${st.key}_heading`}>{st.he} — כותרת</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1" title="המסגרת הכמה בזרם הזה (ימין = 1, שמאל = 2)">
                    מס׳ בזרם
                    <input
                      type="number"
                      min={1}
                      max={50}
                      disabled={readOnly}
                      value={f.seq ?? ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (v >= 1 && v <= 50) act.frameSeq(f.fid, v)
                      }}
                      className="w-12 rounded border border-surface-variant bg-surface px-1 py-0.5"
                    />
                  </label>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <select
                    disabled={readOnly}
                    value={f.kind || ''}
                    onChange={(e) => update(f.fid, { kind: e.target.value || undefined })}
                    className="rounded border border-surface-variant bg-surface px-1 py-0.5 text-xs"
                    title="מסגרת-אובייקט אינה קולטת שורות לזרם"
                  >
                    <option value="">מסגרת-טקסט</option>
                    {Object.entries(FRAME_OBJECT_KINDS).map(([k, v]) => (
                      <option key={k} value={k}>אובייקט: {v}</option>
                    ))}
                  </select>
                  <span className="flex-1" />
                  <button disabled={readOnly || i === 0} onClick={() => move(i, -1)} className={btn} title="מוקדם יותר בסדר-הקריאה">▲</button>
                  <button disabled={readOnly || i === frames.length - 1} onClick={() => move(i, 1)} className={btn} title="מאוחר יותר">▼</button>
                  <button disabled={readOnly} onClick={() => act.selectFrame(f.fid)} className={btn}>בחר</button>
                  <button disabled={readOnly} onClick={() => del(f.fid)} className={`${btn} text-danger-700`}>מחק</button>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="כללי המסגרות">
        <ul className="list-disc space-y-1 pr-4 text-xs text-on-surface/70">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
