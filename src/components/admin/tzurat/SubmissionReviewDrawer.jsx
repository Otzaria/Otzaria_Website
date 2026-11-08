'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import ErrorState from '@/components/ui/ErrorState'
import Loader from '@/components/ui/Loader'
import Notice from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { fieldClasses } from '@/components/ui/fieldStyles'
import RelativeTime from '@/components/ui/RelativeTime'
import { apiCall, pageImageUrl } from './adminApi'
import { CHECK_LABEL, CHECK_VALUE, REPORT_CATEGORY, VERDICT_LABEL, kindLabel, words } from './adminLabels'
import { REJECT_REASON, keepOps, lineChanges, opLabel } from './lineDiff'
import RegionImage, { RegionLegend, arrBox } from './RegionImage'
import CheckRow from '@/components/ui/CheckRow'
import { StatusBadge, actionError } from './TzuratBits'
import { loginHref } from '@/components/admin/list/adminRequest'
import { roundText } from '@/lib/adminTzuratScreen/tzuratTerms'

// סקירת הגשת עמוד — מגירה רחבה (ui/Drawer wide; לשעבר חלון במסך מלא): הסריקה ליד העמוד שלנו (עם מסגרות לשורות
// שהשתנו ולאזורי הדיווחים — RegionImage, בלי שינוי), שבירת השורות לפני / אחרי (applyLineOps — אותה פונקציה של השרת)
// וסימוני השורות שיישמרו (העוגנים), התשובות להחלטות, החלטות שנוספו ידנית, הדיווחים, "מבט כללי" והערת המתנדב.
// בתחתית: הערת בודק, "אשר" (הפעולה הראשית) ו"דחה" (אחרונה, באדום, עם אישור) — אותה בקשה כמו קודם:
// PATCH submissions/[id] {action, note, lineOps?} — lineOps נשלח רק כשהמנהל הוריד פעולות.

function Block({ title, children, testId, className }) {
  return (
    <section aria-label={title} data-testid={testId} className={`flex min-w-0 flex-col gap-2 rounded-(--radius-card) bg-surface-container-low p-4 ${className || ''}`}>
      <h3 className="text-title-sm text-on-surface">{title}</h3>
      {children}
    </section>
  )
}

/** @param {{ id: string, onClose: () => void, onDone?: (id: string, status: string) => void }} props */
export default function SubmissionReviewDrawer({ id, onClose, onDone }) {
  const noteId = useId()
  const [confirm, confirmElement] = useConfirm()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [tick, setTick] = useState(0)
  const [dropped, setDropped] = useState(() => new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let on = true
    apiCall(`submissions/${encodeURIComponent(id)}`).then((r) => {
      if (!on) return
      if (r.ok && r.data?.submission) {
        setData(r.data)
        setLoadError(null)
      } else setLoadError(r.error || 'טעינת ההגשה נכשלה')
    })
    return () => {
      on = false
    }
  }, [id, tick])

  const sub = data?.submission
  const page = data?.page
  const model = page?.model
  const ops = useMemo(() => sub?.lineOps || [], [sub])
  const kept = useMemo(() => keepOps(ops, dropped), [ops, dropped])
  const diff = useMemo(() => (model ? lineChanges(model, kept) : { lines: [], rejected: [], anchors: [] }), [model, kept])
  const pending = sub?.status === 'submitted'

  const itemsById = useMemo(() => new Map((data?.items || []).map((it) => [String(it.id), it])), [data])
  const manualIds = new Set((sub?.manualItems || []).map(String))
  const manual = (data?.items || []).filter((it) => it.manual || manualIds.has(String(it.id)))
  const reports = data?.reports || []
  const pageName = `${page?.masechet || ''} ${page?.daf || ''}`.trim()

  // מסגרות: שורות שהשתנו (לפי המודל) ואזורי הדיווחים
  const boxes = (side) => {
    const out = []
    if (model) {
      const changed = new Set(diff.lines.map((l) => l.key))
      for (const b of model.blocks || []) {
        for (const l of b.lines || []) {
          const box = changed.has(`${b.id}:${l.i}`) ? arrBox(l[side]) : null
          if (box) out.push({ ...box, key: `l:${b.id}:${l.i}`, tone: 'line', label: `${b.label || b.id} · שורה ${l.i + 1}` })
        }
      }
    }
    reports.forEach((r, ri) =>
      (r.regions || []).forEach((g, gi) => {
        if (g.side === side) out.push({ x: g.x, y: g.y, w: g.w, h: g.h, key: `r:${ri}:${gi}`, tone: 'report', label: REPORT_CATEGORY[r.category] || r.category })
      })
    )
    return out
  }

  const toggleOp = (i) =>
    setDropped((cur) => {
      const next = new Set(cur)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const act = async (action) => {
    if (action === 'reject') {
      const ok = await confirm({
        title: 'לדחות את ההגשה?',
        body: `העמוד ${pageName} ייפתח שוב לבדיקה, וההגשה הזו לא תיכנס.`,
        confirmLabel: 'דחה',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusy(true)
    setError(null)
    const body = { action, note }
    if (action === 'approve' && dropped.size) body.lineOps = kept
    const r = await apiCall(`submissions/${encodeURIComponent(id)}`, { method: 'PATCH', body, failMessage: 'לא הצלחנו לשמור את ההחלטה על ההגשה. נסה שוב.' })
    setBusy(false)
    if (!r.ok) return setError(actionError(r))
    onDone?.(id, r.data?.submission?.status || (action === 'approve' ? 'approved' : 'rejected'))
  }

  const side = (key, label) => {
    const img = page?.[key]
    return (
      <figure className="flex min-w-0 flex-1 flex-col gap-1">
        <figcaption className="text-label-lg text-on-surface-variant">{label}</figcaption>
        <RegionImage src={img?.url || (page?.id ? pageImageUrl(page.id, key) : '')} alt={`${label} — ${pageName}`} boxes={boxes(key)}
          className="overflow-hidden rounded-(--radius-shape) bg-surface-container-lowest" />
      </figure>
    )
  }

  const subtitle = sub && (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusBadge kind="submission" status={sub.status} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{sub.userName} · {roundText(sub.round ?? page?.round)}</span>
      {(sub.createdAt || sub.at) && <RelativeTime date={sub.createdAt || sub.at} prefix="· הוגשה" />}
      {sub.reviewedByName && (
        <span>
          · נבדק ע״י {sub.reviewedByName}
          {sub.reviewerEdited ? ' (עם תיקונים)' : ''}
          {sub.reviewNote ? ` — ${sub.reviewNote}` : ''}
        </span>
      )}
    </span>
  )

  const footer = pending && (
    <div className="flex w-full flex-wrap items-center gap-3">
      <p className="w-full text-body-sm text-on-surface-variant">
        אישור שומר את סימוני השורות ואת התשובות של המתנדב, וההערה נשלחת אליו. דחייה פותחת את העמוד שוב לבדיקה.
      </p>
      <label htmlFor={noteId} className="sr-only">הערת בודק</label>
      <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="הערה למתנדב (לא חובה)"
        className={fieldClasses({ className: 'min-w-0 flex-1 basis-56' })} />
      <Button icon="check" onClick={() => act('approve')} softDisabled={busy} loading={busy}>
        {dropped.size ? `אשר בלי ${dropped.size === 1 ? 'פעולה אחת' : `${dropped.size} פעולות`}` : 'אשר'}
      </Button>
      <Button variant="danger" icon="close" onClick={() => act('reject')} softDisabled={busy}>
        דחה
      </Button>
    </div>
  )

  return (
    <Drawer wide title={pageName ? `הגשה: ${pageName}` : 'הגשה'} subtitle={subtitle} onClose={onClose} footer={footer || undefined}>
      {loadError && !data ? (
        <ErrorState title="לא הצלחנו לטעון את ההגשה" description={loadError} onRetry={() => setTick((t) => t + 1)} />
      ) : !data ? (
        <div className="flex justify-center py-10"><Loader label="טוען את ההגשה…" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && (
            <Notice tone="error" role="alert" action={error.sessionExpired ? <a href={loginHref()} className="underline underline-offset-2">התחבר</a> : null}>
              {error.text}
            </Notice>
          )}
          {/* תוכן ההגשה — לא הודעה חיה (בלי role), כדי שפתיחת המגירה לא תכריז את כל מה שבתוכה */}
          {sub.note && <Notice tone="info" role={null} title="הערת המתנדב">{sub.note}</Notice>}

          <RegionLegend tones={[...new Set([...boxes('scan'), ...boxes('ours')].map((b) => b.tone))].sort()} />
          <div className="flex flex-col gap-4 lg:flex-row">
            {side('scan', 'הסריקה (וילנא)')}
            {side('ours', 'העמוד שלנו')}
          </div>

          <Block title="שבירת שורות" testId="line-changes">
            {!ops.length ? (
              <p className="text-body-sm text-on-surface-variant">אין פעולות שורה בהגשה</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1 text-body-sm" aria-label="פעולות המתנדב">
                  {ops.map((op, i) => (
                    <li key={`${i}:${op.block}:${op.line}`} className={dropped.has(i) ? 'text-on-surface-variant line-through' : ''}>
                      {pending ? (
                        <CheckRow checked={!dropped.has(i)} onChange={() => toggleOp(i)} aria-label={`השאר: ${opLabel(op, model)}`}>
                          {opLabel(op, model)}
                        </CheckRow>
                      ) : opLabel(op, model)}
                    </li>
                  ))}
                </ul>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-lg text-body-sm">
                    <thead className="text-start text-on-surface-variant">
                      <tr>
                        <th scope="col" className="p-1 text-start font-normal">שורה</th>
                        <th scope="col" className="p-1 text-start font-normal">לפני</th>
                        <th scope="col" className="p-1 text-start font-normal">אחרי</th>
                        <th scope="col" className="p-1 text-start font-normal">הדפוס (זיהוי טקסט)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.lines.map((l) => (
                        <tr key={l.key} className="border-t border-outline-variant align-top" data-testid="line-row">
                          <td className="whitespace-nowrap p-1">
                            {l.blockLabel} · {l.line + 1}
                            {l.action === 'confirm' && <div className="text-success">אושרה</div>}
                          </td>
                          <td className="p-1 text-on-surface-variant" data-testid="line-before">{l.before}</td>
                          <td className={`p-1 ${l.changed ? 'text-on-surface' : 'text-on-surface-variant'}`} data-testid="line-after">{l.after}</td>
                          <td className="p-1 text-on-surface-variant">{l.print}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {diff.rejected.length > 0 && (
                  <ul className="list-disc ps-5 text-body-sm text-on-warning-container" data-testid="line-rejected">
                    {diff.rejected.map((r, i) => (
                      <li key={i}>{opLabel(r.op, model)} — {REJECT_REASON[r.reason] || r.reason}</li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary className="cursor-pointer text-on-surface-variant">סימוני השורות שיישמרו ({diff.anchors.length})</summary>
                  <ul className="mt-1 flex flex-col gap-0.5" data-testid="anchors">
                    {diff.anchors.map((a) => (
                      <li key={`${a.block}:${a.line}`}>
                        {a.block} · שורה {a.line + 1}: {a.action === 'start' ? `מתחילה ב-${a.ref} #${a.wi}` : 'נבדקה ונכונה'}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </Block>

          {sub.answerIssues?.length > 0 && (
            <Notice tone="warning" role={null} title="תשובות שלא נוספו להחלטות — כדאי לבדוק לפני שמאשרים">
              <ul className="list-disc ps-5">{sub.answerIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
            </Notice>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Block title={`תשובות להחלטות (${(sub.itemAnswers || []).length})`}>
              <ul className="flex flex-col gap-2 text-body-sm">
                {(sub.itemAnswers || []).map((a, i) => {
                  const it = itemsById.get(String(a.item))
                  return (
                    <li key={`${a.item}:${i}`} className="flex flex-col gap-0.5" data-testid="item-answer">
                      <span className="text-on-surface-variant">{it ? `${kindLabel(it.kind)} · ${words(it.ctxBefore)} … ${words(it.ctxAfter)}` : a.item}</span>
                      {it && (
                        <span>
                          אוצריא: <span className="text-on-surface">{words(it.otz) || '(אין)'}</span> · הדפוס לפי זיהוי הטקסט: <span className="text-on-surface">{words(it.print) || '(אין)'}</span>
                        </span>
                      )}
                      <span>
                        תשובה: <span className="text-on-surface">{VERDICT_LABEL[a.verdict] || a.verdict || a.choice}</span>
                        {a.text ? ` «${a.text}»` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {manual.length > 0 && (
                <>
                  <h4 className="mt-2 text-label-lg text-on-surface">נוסח שהמתנדב תיקן בעמוד ({manual.length})</h4>
                  <ul className="flex flex-col gap-1 text-body-sm">
                    {manual.map((it) => (
                      <li key={it.id} data-testid="manual-item">
                        {kindLabel(it.kind)}: אצלנו <span className="text-on-surface">{words(it.otz)}</span> ← בדפוס <span className="text-on-surface">{words(it.print) || it.text}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Block>

            <Block title="מבט כללי ודיווחים">
              <ul className="flex flex-wrap gap-2">
                {Object.entries(sub.checks || {}).map(([k, v]) => (
                  <li key={k}><Badge tone={v === 'issue' ? 'warning' : 'success'}>{CHECK_LABEL[k] || k}: {CHECK_VALUE[v] || v}</Badge></li>
                ))}
              </ul>
              <h4 className="mt-2 text-label-lg text-on-surface">דיווחים ({reports.length})</h4>
              <ul className="flex flex-col gap-1 text-body-sm">
                {reports.map((r, i) => (
                  <li key={r.id || i} data-testid="sub-report" className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-on-surface">{REPORT_CATEGORY[r.category] || r.category}:</span> {r.text}
                    {r.status && <StatusBadge kind="report" status={r.status} />}
                    {(r.regions || []).length > 0 && <span className="text-on-surface-variant">· {r.regions.length === 1 ? 'אזור אחד מסומן' : `${r.regions.length} אזורים מסומנים`} בתמונות</span>}
                  </li>
                ))}
              </ul>
            </Block>
          </div>
        </div>
      )}
      {confirmElement}
    </Drawer>
  )
}
