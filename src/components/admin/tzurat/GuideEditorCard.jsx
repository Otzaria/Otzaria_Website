'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'
import MenuButton from '@/components/ui/MenuButton'
import Notice from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { fieldClasses } from '@/components/ui/fieldStyles'
import GuideBody from '@/components/pageProof/guide/GuideBody'
import { errorToast } from '@/components/admin/list/adminRequest'
import { API as ADMIN_API, apiCall } from './adminApi'
import ListLoading from '@/components/ui/ListLoading'
import CardSection from '@/components/ui/CardSection'

// לשונית "הנחיות": עריכת דף ההנחיות של צורת הדף (/docs/tzurat-hadaf) — אותן בקשות כמו קודם
// (api/admin/tzurat-hadaf/guide: GET {saved, default, codes} / PUT {html, preview?} / DELETE), דרך apiCall (send המשותף:
// הפניה לדף ההתחברות אינה הצלחה). אחרי שמירה / חזרה למקור / "בטל שינויים" — עדכון מקומי, בלי GET נוסף.
// קודים שלא הוכרו בשמירה — הודעת אזהרה קבועה מעל העורך (לא נעלמת מעצמה). התצוגה המקדימה — GuideBody של הגהת עמודים (HTML שכבר נוקה בשרת).
// "שמור" — הפעולה הראשית; "חזור לנוסח המקורי" (מוחק את הנוסח השמור) — בתפריט ⋮, אחרון ובאדום, עם אישור.
// onDirty(true/false) — יש שינוי שלא נשמר (המעטפת שואלת לפני מעבר לשונית או יציאה).

export const GUIDE_API = `${ADMIN_API}/guide`
export const GUIDE_PATH = '/docs/tzurat-hadaf'

/** בקשה לדף ההנחיות; כשל — זורק {message, sessionExpired} בעברית */
async function request(method, body) {
  const r = await apiCall(GUIDE_API, { method, body })
  if (!r.ok || r.data?.success === false) throw Object.assign(new Error(r.error || 'הפעולה נכשלה'), { sessionExpired: r.sessionExpired })
  return r.data
}

const codeChip = 'inline-flex min-h-8 items-center rounded-(--radius-pill) bg-surface-container px-3 text-label-md text-on-surface transition-colors hover:bg-surface-container-high'

/** @param {{ onDirty?: (dirty: boolean) => void }} props */
export default function GuideEditorCard({ onDirty }) {
  const toast = useToast()
  const areaId = useId()
  const [confirm, confirmElement] = useConfirm()
  const [data, setData] = useState(null) // {saved, default, codes}
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null) // {html, toc, unknown}
  const [busy, setBusy] = useState(null) // 'preview' | 'save' | 'reset' | null
  const [error, setError] = useState(null)
  const [unknown, setUnknown] = useState([]) // קודים שלא הוכרו בשמירה האחרונה
  const area = useRef(null)
  const headingRef = useRef(null)
  const [tick, setTick] = useState(0)
  const load = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let on = true
    request('GET')
      .then((d) => {
        if (!on) return
        setData(d)
        setText(d.saved?.html || d.default || '')
        setPreview(null)
        setError(null)
      })
      .catch((e) => on && setError(e.message))
    return () => {
      on = false
    }
  }, [tick])

  const current = data ? data.saved?.html || data.default || '' : ''
  const dirty = !!data && text !== current
  useEffect(() => {
    onDirty?.(dirty)
  }, [dirty, onDirty])

  const call = async (kind, method, body) => {
    if (busy) return null
    setBusy(kind)
    try {
      return await request(method, body)
    } catch (e) {
      toast.show(errorToast(e, 'הפעולה נכשלה'))
      return null
    } finally {
      setBusy(null)
    }
  }

  const doPreview = async () => {
    const d = await call('preview', 'PUT', { html: text, preview: true })
    if (d) setPreview(d.preview || null)
  }

  const save = async () => {
    if (!dirty) return
    const d = await call('save', 'PUT', { html: text })
    if (!d) return
    // הנוסח שנשמר — כפי שהשרת ניקה אותו (בלי GET נוסף); "לא נשמר" נעלם מיד
    const html = typeof d.html === 'string' ? d.html : text
    setData((cur) => ({ ...cur, saved: { ...(cur?.saved || {}), html, at: d.at || new Date().toISOString(), byName: undefined } }))
    setText(html)
    setUnknown(Array.isArray(d.unknown) ? d.unknown : [])
    toast.show({ message: 'דף ההנחיות עודכן.' })
  }

  const discard = () => {
    setText(current)
    area.current?.focus()
  }

  const reset = async () => {
    const ok = await confirm({
      title: 'לחזור לנוסח המקורי?',
      body: 'הנוסח השמור יימחק, ודף ההנחיות יציג שוב את הנוסח המקורי. אי אפשר לשחזר את הנוסח שנמחק.',
      confirmLabel: 'חזור לנוסח המקורי',
      tone: 'danger',
    })
    if (!ok) return
    if (await call('reset', 'DELETE')) {
      setData((cur) => ({ ...cur, saved: null }))
      setText(data?.default || '')
      setUnknown([])
      toast.show({ message: 'דף ההנחיות חזר לנוסח המקורי' })
      // ⋮ נעלם (אין נוסח שמור) — הפוקוס לכותרת האזור
      requestAnimationFrame(() => headingRef.current?.focus())
    }
  }

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

  if (error && !data) return <ErrorState title="לא הצלחנו לטעון את ההנחיות" description={error} onRetry={load} />

  const codes = data?.codes || {}
  const figureCodes = codes.figures || []
  const otherCodes = [...(codes.buttons || []), ...(codes.values || [])]
  const savedInfo = data?.saved
    ? `מוצג הנוסח שנשמר${data.saved.byName ? ` בידי ${data.saved.byName}` : ''}${data.saved.at ? ` (${new Date(data.saved.at).toLocaleString('he-IL')})` : ''}`
    : 'מוצג הנוסח המקורי (לא נשמר נוסח אחר)'
  const menuItems = [{ id: 'reset', icon: 'restore', label: 'חזור לנוסח המקורי', danger: true, disabled: !!busy, onSelect: reset }]

  return (
    <CardSection
      title="דף ההנחיות למתנדבים"
      headingRef={headingRef}
      testId="guide-editor"
      actions={data?.saved && <MenuButton label="עוד פעולות להנחיות" items={menuItems} />}
      description={data && (
        <>
          {savedInfo} ·{' '}
          <a href={GUIDE_PATH} target="_blank" rel="noopener" className="text-primary underline underline-offset-2">פתח את הדף</a>
        </>
      )}
    >
      {error && data && <Notice tone="error" role="alert">{error}</Notice>}
      {!data ? <ListLoading rows={2} /> : (
        <div className="flex flex-col gap-3">
          {unknown.length > 0 && (
            <Notice tone="warning" role="status" title="קודים שלא הוכרו">
              הם נשמרו ויוצגו בדף כמו שהם: <bdi dir="ltr">{unknown.join(' · ')}</bdi>
            </Notice>
          )}
          <p className="text-body-sm text-on-surface-variant">
            כל פרק — <Code>{'<section id="…">'}</Code> עם כותרת <Code>{'<h2>'}</Code>; פסקה <Code>{'<p>'}</Code> (עם <Code>class=&quot;note&quot;</Code> — מסגרת
            הדגשה, <Code>class=&quot;muted&quot;</Code> — משני); רשימות <Code>{'<ol>'}</Code> ו-<Code>{'<ul>'}</Code>; <Code>{'<b>'}</Code>, <Code>{'<kbd>'}</Code> וקישור <Code>{'<a href>'}</Code>. כל השאר יורד בשמירה.
          </p>
          <label htmlFor={areaId} className="sr-only">תוכן דף ההנחיות (HTML)</label>
          <textarea
            id={areaId}
            ref={area}
            dir="rtl"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={24}
            spellCheck={false}
            className={fieldClasses({ kind: 'textarea', className: 'font-mono text-body-sm leading-relaxed' })}
          />
          {(figureCodes.length > 0 || otherCodes.length > 0) && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="הוספת קוד במקום הסמן">
              <span className="text-label-md text-on-surface-variant">הוספה במקום הסמן:</span>
              {figureCodes.map((c) => (
                <button key={c} type="button" onClick={() => insert(c)} className={codeChip}><bdi dir="ltr">{c}</bdi></button>
              ))}
              {otherCodes.map((c) => (
                <button key={c.code} type="button" onClick={() => insert(c.code)} title={c.text} className={codeChip}><bdi dir="ltr">{c.code}</bdi></button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {/* softDisabled ולא disabled — אחרי השמירה הכפתור "כבוי" אבל הפוקוס נשאר עליו */}
            <Button icon="save" onClick={save} softDisabled={!dirty || !!busy} aria-busy={busy === 'save' || undefined}>
              {busy === 'save' ? 'שומר…' : 'שמור ועדכן את הדף'}
            </Button>
            <Button variant="outlined" icon="visibility" onClick={doPreview} disabled={!!busy && busy !== 'preview'} loading={busy === 'preview'}>
              תצוגה מקדימה
            </Button>
            <Button variant="text" onClick={discard} softDisabled={!dirty || !!busy}>
              בטל שינויים
            </Button>
            {dirty && <span className="text-body-sm text-on-surface-variant">יש שינויים שלא נשמרו</span>}
          </div>
          {preview && (
            <section aria-label="תצוגה מקדימה" className="flex flex-col gap-3 rounded-(--radius-card) bg-surface-container-low p-4">
              {(preview.unknown || []).length > 0 && (
                <Notice tone="warning" role="alert">קודים שלא הוכרו (יוצגו כמו שהם): {preview.unknown.join(' · ')}</Notice>
              )}
              <GuideBody html={preview.html} />
            </section>
          )}
        </div>
      )}
      {confirmElement}
    </CardSection>
  )
}

function Code({ children }) {
  return <bdi dir="ltr" className="font-mono">{children}</bdi>
}
