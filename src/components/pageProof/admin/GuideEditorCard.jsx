'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import GuideBody from '@/components/pageProof/guide/GuideBody'
import { GUIDE_PATH } from '@/lib/pageProof/helpTexts'

// "דף ההנחיות למתנדבים" — עריכת /docs/page-proof מדף הניהול (api/admin/page-proof/guide; הכללים — lib/pageProof/guideContent).
// בעל הפרויקט (2026-10-06): להגיה את הדף כאן, בלי בקשת-שינוי לקוד על כל הגהה. HTML פשוט, עם קודים לאיורים, לשמות
// הכפתורים ולערכים; "תצוגה מקדימה" מראה בדיוק מה יופיע (אחרי הניקוי), "שמור" מעדכן את הדף מיד, ו"חזרה לנוסח המקורי" מוחקת
// את הנוסח השמור. מקופל כברירת-מחדל.

const API = '/api/admin/page-proof/guide'
const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40'

const failMsg = (e, fallback = 'הפעולה נכשלה — בדקו את החיבור ונסו שוב') =>
  e?.name === 'TypeError' || e?.name === 'SyntaxError' || !e?.message ? fallback : e.message

export default function GuideEditorCard() {
  const { showAlert, showConfirm } = useDialog()
  const [data, setData] = useState(null) // {saved, default, codes}
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null) // {html, toc, unknown}
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const area = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(API)
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'הטעינה נכשלה')
      setData(d)
      setText(d.saved?.html || d.default)
      setPreview(null)
      setError(null)
    } catch (e) {
      setError(failMsg(e, 'הטעינה נכשלה — בדקו את החיבור ונסו שוב'))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const call = async (method, body) => {
    setBusy(true)
    try {
      const res = await fetch(API, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'הפעולה נכשלה')
      return d
    } catch (e) {
      showAlert('שגיאה', failMsg(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const doPreview = async () => {
    const d = await call('PUT', { html: text, preview: true })
    if (d) setPreview(d.preview)
  }

  const save = async () => {
    const d = await call('PUT', { html: text })
    if (!d) return
    await load()
    showAlert('נשמר', `דף ההנחיות עודכן.${d.unknown?.length ? `\nקודים שלא הוכרו (נשארו כמו שהם): ${d.unknown.join(' · ')}` : ''}`)
  }

  const reset = () =>
    showConfirm(
      'חזרה לנוסח המקורי',
      'הנוסח השמור יימחק, והדף יציג את הנוסח המקורי (מהקוד).',
      async () => {
        if (await call('DELETE')) await load()
      },
      'חזור לנוסח המקורי',
      'ביטול'
    )

  // הוספת קוד במקום הסמן
  const insert = (code) => {
    const el = area.current
    const at = el ? el.selectionStart : text.length
    const end = el ? el.selectionEnd : text.length
    setText(text.slice(0, at) + code + text.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = at + code.length
    })
  }

  const dirty = data && text !== (data.saved?.html || data.default)
  const savedInfo = data?.saved
    ? `מוצג הנוסח שנשמר${data.saved.byName ? ` בידי ${data.saved.byName}` : ''}${data.saved.at ? ` (${new Date(data.saved.at).toLocaleString('he-IL')})` : ''}`
    : 'מוצג הנוסח המקורי (לא נשמר נוסח אחר)'

  return (
    <details className="glass-strong rounded-xl p-4" data-testid="guide-editor">
      <summary className="cursor-pointer text-lg font-bold text-on-surface">דף ההנחיות למתנדבים</summary>
      {error && !data ? (
        <p role="alert" className="mt-3 text-danger-700">
          {error}
        </p>
      ) : !data ? (
        <p className="mt-3 text-sm text-on-surface/60">טוען…</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-on-surface/70">
            {savedInfo} ·{' '}
            <a href={GUIDE_PATH} target="_blank" rel="noopener" className="font-bold text-primary hover:underline">
              פתח את הדף
            </a>
          </p>
          <p className="text-xs text-on-surface/60">
            HTML פשוט: פרק = &lt;section id=&quot;…&quot;&gt; עם כותרת &lt;h2&gt;; פסקה &lt;p&gt; (class=&quot;note&quot; — מסגרת-הדגשה,
            &quot;muted&quot; — משני); רשימות &lt;ol&gt;/&lt;ul&gt;; &lt;b&gt;, &lt;kbd&gt;, קישור &lt;a href&gt;. כל השאר יורד בשמירה.
          </p>
          <textarea
            ref={area}
            dir="rtl"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={24}
            spellCheck={false}
            aria-label="תוכן דף ההנחיות (HTML)"
            className="w-full rounded-lg border border-surface-variant bg-surface p-3 font-mono text-sm leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="קודים">
            <span className="font-bold text-on-surface/70">הוספה במקום הסמן:</span>
            {data.codes.figures.map((c) => (
              <button key={c} type="button" onClick={() => insert(c)} className="rounded-full border border-surface-variant px-2 py-0.5 hover:bg-surface-variant">
                {c}
              </button>
            ))}
            {[...data.codes.buttons, ...data.codes.values].map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => insert(c.code)}
                title={c.text}
                className="rounded-full border border-surface-variant px-2 py-0.5 hover:bg-surface-variant"
              >
                {c.code}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={doPreview} className={`${btn} border border-surface-variant bg-white hover:bg-surface-variant/60`}>
              תצוגה מקדימה
            </button>
            <button type="button" disabled={busy || !dirty} onClick={save} className={`${btn} bg-primary text-on-primary hover:bg-accent`}>
              שמור ועדכן את הדף
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className={`${btn} hover:bg-surface-variant`}>
              בטל שינויים
            </button>
            <span className="flex-1" />
            <button type="button" disabled={busy || !data.saved} onClick={reset} className={`${btn} text-danger-700 hover:bg-danger-100`}>
              חזרה לנוסח המקורי
            </button>
          </div>
          {preview && (
            <section aria-label="תצוגה מקדימה" className="rounded-xl border-2 border-dashed border-primary/40 bg-background p-4">
              {preview.unknown.length > 0 && (
                <p role="alert" className="mb-3 text-sm text-warning-800">
                  קודים שלא הוכרו (יוצגו כמו שהם): {preview.unknown.join(' · ')}
                </p>
              )}
              <GuideBody html={preview.html} />
            </section>
          )}
        </div>
      )}
    </details>
  )
}
