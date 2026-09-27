'use client'

// חלונית-ההצעות למילה: חלופות-הזיהוי (alternatives, עם הסתברות מכוילת) ושני
// סוגי חשד מודל-השפה (lm — הצעה של המודל, סגול; rec — חלופת-זיהוי שמתאימה
// להקשר, כתום). בחירה = תיקון-טקסט רגיל; אין החלפה אוטומטית לעולם.

const pct = (p) => `${Math.round((p || 0) * 100)}%`

export default function WordSuggestions({ token, onPick, onClose, readOnly }) {
  const { alt, lm } = token
  const Item = ({ text, meta, color }) => (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onPick(text)}
      className="flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-right hover:bg-surface-variant disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className="font-bold" style={{ color }}>{text}</span>
      <span className="text-xs text-on-surface/60">{meta}</span>
    </button>
  )

  return (
    <div
      className="absolute z-30 mt-1 w-64 rounded-lg border border-surface-variant bg-surface p-2 text-sm shadow-xl"
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-on-surface/60">
        <span>«{token.text}»</span>
        {alt && <span>נכונה בסבירות {pct(alt.p)}</span>}
      </div>
      {alt?.alts?.length > 0 && (
        <div className="mb-1">
          <div className="text-xs font-bold text-info-700">חלופות-הזיהוי</div>
          {alt.alts.map((a) => (
            <Item key={`a-${a.text}`} text={a.text} meta={pct(a.p)} color="#1d4ed8" />
          ))}
          {typeof alt.other_p === 'number' && (
            <div className="px-2 text-xs text-on-surface/50">אף אחת מאלה: {pct(alt.other_p)}</div>
          )}
        </div>
      )}
      {lm?.lm?.length > 0 && (
        <div className="mb-1">
          <div className="text-xs font-bold" style={{ color: '#7c3aed' }}>הצעת מודל-השפה</div>
          {lm.lm.map((a) => (
            <Item key={`l-${a.text}`} text={a.text} meta={`+${a.gain.toFixed(1)}`} color="#7c3aed" />
          ))}
        </div>
      )}
      {lm?.rec?.length > 0 && (
        <div>
          <div className="text-xs font-bold" style={{ color: '#c2410c' }}>חלופה שמתאימה להקשר</div>
          {lm.rec.map((a) => (
            <Item key={`r-${a.text}`} text={a.text} meta={`+${a.gain.toFixed(1)}`} color="#c2410c" />
          ))}
        </div>
      )}
      {!readOnly && <div className="mt-1 border-t border-surface-variant pt-1 text-xs text-on-surface/50">לחיצה על הצעה מחליפה את המילה בשורה</div>}
    </div>
  )
}
