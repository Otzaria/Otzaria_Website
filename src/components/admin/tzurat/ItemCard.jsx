'use client'

import { useId, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import MenuButton from '@/components/ui/MenuButton'
import { useToast } from '@/components/ui/Toast'
import { fieldClasses } from '@/components/ui/fieldStyles'
import RelativeTime from '@/components/ui/RelativeTime'
import { apiCall } from './adminApi'
import { QUESTION_LABEL, VERDICT_LABEL, VIA_LABEL, hintBadges, kindLabel, resolveVerdicts, words } from './adminLabels'
import ActionError from '@/components/admin/list/ActionError'
import { StatusBadge, actionError } from './TzuratBits'

// החלטת נוסח אחת למנהל (AdminItem): החיתוך מהסריקה, ההקשר, שתי הקריאות **מסומנות** (המנהל אינו "עיוור": "אוצריא"
// מול "הדפוס לפי זיהוי הטקסט"), התשובות של המתנדבים, רמזי העדים, וההכרעה — אותן בקשות כמו קודם:
// PATCH items/[id] {action:'resolve', verdict, text?} | {action:'reopen'} | {action:'unflag'} | {action:'obsolete'} → {item}.
// ההכרעות — כפתורים שקולים (אין "ראשית" אחת: זו בחירה בין אפשרויות); הפעולות הנדירות ב-⋮. אחרי פעולה הכרטיס נשאר
// במקומו, רק התג מתחלף, והודעה קופצת אומרת מה נעשה (הכרעה הפיכה — "פתח מחדש למתנדבים").

const RESOLVE_TEXT = {
  print: 'כמו הדפוס',
  otz: 'כמו אוצריא',
  elsewhere: 'נדפס במקום אחר',
}

const DONE_TEXT = {
  reopen: 'נפתחה מחדש למתנדבים',
  unflag: 'כבר לא מסומנת "דורש בדיקה"',
  obsolete: 'סומנה כלא רלוונטית',
}

export default function ItemCard({ item, onChange }) {
  const toast = useToast()
  const otherId = useId()
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const title = `${item.masechet || item.slug} ${item.daf || ''}`.trim()
  // שם ייחודי לקורא המסך — כמה החלטות באותו דף: גם סוג הגוש והמילים שבאוצריא
  const fullName = `${title}, ${kindLabel(item.kind)}: ${words(item.otz) || 'בלי מילים'}`

  const act = async (body) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await apiCall(`items/${encodeURIComponent(item.id)}`, { method: 'PATCH', body, failMessage: 'לא הצלחנו לשמור את ההחלטה. נסה שוב.' })
    setBusy(false)
    if (!r.ok) return setError(actionError(r))
    onChange?.(r.data?.item || { ...item }, item.status)
    if (body.verdict === 'other') setOther('')
    const what = body.action === 'resolve' ? `הוכרעה: ${body.verdict === 'other' ? 'טקסט אחר' : RESOLVE_TEXT[body.verdict]}` : DONE_TEXT[body.action]
    toast.show({ message: `ההחלטה ב${title} ${what}` })
  }

  const verdicts = resolveVerdicts(item).filter((v) => v !== 'other')
  const hints = hintBadges(item.hints)
  const closed = item.status === 'resolved' || item.status === 'obsolete'
  const menuItems = []
  if (item.status !== 'open') menuItems.push({ id: 'reopen', icon: 'undo', label: 'פתח מחדש למתנדבים', disabled: busy, onSelect: () => act({ action: 'reopen' }) })
  if (item.status === 'flagged') menuItems.push({ id: 'unflag', icon: 'flag', label: 'בטל את "דורש בדיקה"', disabled: busy, onSelect: () => act({ action: 'unflag' }) })
  if (!closed) {
    if (menuItems.length) menuItems.push({ separator: true, id: 'sep' })
    menuItems.push({ id: 'obsolete', icon: 'block', label: 'לא רלוונטי', disabled: busy, onSelect: () => act({ action: 'obsolete' }) })
  }

  return (
    <article className={cardClasses({ padding: 'md', className: 'flex min-w-0 flex-col gap-4' })} data-testid="admin-item" aria-label={`החלטה ב${fullName}`}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-title-sm text-on-surface">{title}</h3>
            <StatusBadge kind="item" status={item.status} />
            {item.manual && <Badge tone="info">נוסף בבדיקת עמוד</Badge>}
          </div>
          <p className="text-body-sm text-on-surface-variant">
            {kindLabel(item.kind)} · {QUESTION_LABEL[item.question] || item.question}
          </p>
          {item.status === 'flagged' && (
            <p className="text-body-sm text-on-surface-variant" data-testid="item-flagged-why">
              מתנדב סימן שהחיתוך מהסריקה לא מראה את המקום הנכון — כדאי לבדוק את העמוד לפני שמכריעים.
            </p>
          )}
        </div>
        {menuItems.length > 0 && <MenuButton label={`עוד פעולות להחלטה ב${fullName}`} items={menuItems} />}
      </header>

      {hints.length > 0 && (
        <ul aria-label="רמזים ממקורות אחרים" className="flex flex-wrap items-center gap-2">
          <li className="text-body-sm text-on-surface-variant" aria-hidden="true">מה אומרים מקורות אחרים:</li>
          {hints.map((h) => <li key={h.key} data-testid="item-hint"><Badge>{h.text}</Badge></li>)}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-h-24 items-center justify-center overflow-hidden rounded-(--radius-shape) bg-surface-container-lowest p-2">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={`חיתוך מהסריקה — ${title}`} loading="lazy" className="max-h-56 w-auto max-w-full" />
          ) : (
            <p className="text-body-sm text-on-surface-variant">אין מיקום בסריקה</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3 text-body-md">
          <p className="leading-relaxed">
            <span className="text-on-surface-variant">{words(item.ctxBefore)} </span>
            <mark className="rounded-(--radius-sm) bg-warning-container px-1 text-on-warning-container">{words(item.otz) || '(חסר)'}</mark>
            <span className="text-on-surface-variant"> {words(item.ctxAfter)}</span>
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-on-surface-variant">אוצריא</dt>
            <dd data-testid="item-otz" className="break-words">{words(item.otz) || <span className="text-on-surface-variant">(אין)</span>}</dd>
            <dt className="text-on-surface-variant">הדפוס לפי זיהוי הטקסט</dt>
            <dd data-testid="item-print" className="break-words">{words(item.print) || <span className="text-on-surface-variant">(אין)</span>}</dd>
          </dl>
          {(item.answers || []).length > 0 && (
            <ul className="flex min-w-0 flex-col gap-1 text-body-sm [overflow-wrap:anywhere]" aria-label="תשובות המתנדבים">
              {item.answers.map((a, i) => (
                <li key={`${a.user || a.who || i}:${i}`}>
                  <span className="text-on-surface">{a.name || a.who || 'מתנדב'}</span>: {VERDICT_LABEL[a.verdict] || a.verdict}
                  {a.text ? ` «${a.text}»` : ''}
                  <span className="text-on-surface-variant">
                    {' · '}{VIA_LABEL[a.via] || a.via || ''}
                    {a.at && <> · <RelativeTime date={a.at} /></>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {item.resolved?.verdict && (
            <p className="text-body-sm text-success" data-testid="item-resolved">
              הוכרע: {VERDICT_LABEL[item.resolved.verdict] || item.resolved.verdict}
              {item.resolved.text ? ` «${item.resolved.text}»` : ''}
              {item.resolved.byName ? ` — ${item.resolved.byName}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-body-sm text-on-surface-variant">{closed ? 'לשנות את ההכרעה' : 'מה נכון? הבחירה מכריעה וסוגרת את ההחלטה'}</p>
        <div className="flex flex-wrap items-end gap-2" role="group" aria-label={`הכרעה — ${fullName}`}>
          {verdicts.map((v) => (
            <Button key={v} variant="tonal" size="sm" softDisabled={busy} onClick={() => act({ action: 'resolve', verdict: v })}>
              {RESOLVE_TEXT[v]}
            </Button>
          ))}
          <form
            className="flex min-w-0 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!busy && other.trim()) act({ action: 'resolve', verdict: 'other', text: other.trim() })
            }}
          >
            <label htmlFor={otherId} className="sr-only">{`מה נדפס (טקסט אחר) — ${fullName}`}</label>
            <input id={otherId} value={other} onChange={(e) => setOther(e.target.value)} maxLength={500} placeholder="מה נדפס"
              className={fieldClasses({ className: 'w-44' })} />
            <Button type="submit" variant="outlined" size="sm" softDisabled={busy || !other.trim()}>
              טקסט אחר
            </Button>
          </form>
        </div>
      </div>
      <ActionError error={error} />
    </article>
  )
}
