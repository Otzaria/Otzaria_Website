'use client'

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import ListLoading from '@/components/ui/ListLoading'
import Notice from '@/components/ui/Notice'
import ProgressBar from '@/components/ui/ProgressBar'
import { useAsk } from '../useAsk'
import { SECTION_LABELS } from '@/lib/trainingProof/vocab'
import { getJson, sendJson, fmt, fmtDate } from '../api'
import { Card, Empty, Tag } from '../bits'
import UploadCard, { readText } from './UploadCard'

// לשונית "העלאה": שלושה כרטיסים (חלק לכל כרטיס) ורשימת החבילות באתר —
// מה נקרא מכל קובץ, כמה כבר הוגה, השהה/פתח, ומחיקה (עם אזהרה).

// חבילה אחת: שם ומזהה, החלק, מה נקרא מהקובץ, כמה הוגה (פס), מצב — ו"השהה/פתח" · "מחק" (אדום, אחרון)
function PackageRow({ p, busy, onToggle, onRemove }) {
  const done = p.counts.submitted + p.counts.approved
  return (
    <li className="flex flex-col gap-3 border-b border-outline-variant py-3 last:border-0 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-title-sm text-on-surface">{p.label || '—'}</span>
          <Tag>{SECTION_LABELS[p.section]}</Tag>
          {p.open ? <Tag tone="ok">פתוח למתנדבים</Tag> : <Tag>מושהה</Tag>}
        </div>
        <span className="text-body-sm text-on-surface-variant">
          <bdi dir="ltr">{p.packageId} · {p.part}/{p.parts}</bdi> · הועלה {fmtDate(p.uploadedAt)}
        </span>
        <span className="text-body-sm text-on-surface">{readText(p.section, p.read)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 lg:w-48">
        <ProgressBar value={done} max={p.counts.total || 1} label={`כמה הוגה ב${p.label || p.packageId}`} valueText={`${fmt(done)} מתוך ${fmt(p.counts.total)}`} tone="success" />
        <span className="text-body-sm tabular-nums text-on-surface-variant">
          הוגהו {fmt(done)} מתוך {fmt(p.counts.total)}
          {p.counts.held ? ` · ${fmt(p.counts.held)} בעבודה` : ''}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="text" size="sm" icon={p.open ? 'pause_circle' : 'play_circle'} softDisabled={busy} onClick={onToggle}>
          {p.open ? 'השהה' : 'פתח'}
        </Button>
        <Button variant="text" size="sm" icon="delete" softDisabled={busy} onClick={onRemove} className="text-error">
          מחק
        </Button>
      </div>
    </li>
  )
}

function PackagesList({ packages, onChanged }) {
  const { showAlert, ask } = useAsk()
  const [busy, setBusy] = useState(null)
  const path = (p) => `/packages/${p.packageId}/${p.part}`

  const toggle = async (p) => {
    setBusy(p)
    try {
      await sendJson(path(p), { open: !p.open }, 'PATCH')
      onChanged()
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(null)
    }
  }
  const remove = async (p) => {
    const left = p.counts.available + p.counts.held
    const done = p.counts.submitted + p.counts.approved
    const yes = await ask(
      'למחוק את החבילה?',
      `${p.label || p.packageId} (חלק ${p.part}): ${fmt(left)} פריטים שעוד לא הוגו יימחקו מהאתר, עם התמונות שלהם${p.counts.held ? ` — כולל ${fmt(p.counts.held)} שנמצאים עכשיו אצל מתנדבים` : ''}. ${done ? `${fmt(done)} שכבר הוגו נשארים לסקירה ולהורדה.` : ''} אין דרך לשחזר — רק להעלות את הקובץ שוב.`,
      'מחק'
    )
    if (!yes) return
    setBusy(p)
    try {
      const r = await sendJson(path(p), undefined, 'DELETE')
      showAlert('נמחק', `${fmt(r.deleted)} פריטים נמחקו${r.kept ? `, ${fmt(r.kept)} נשארו` : ''}`)
      onChanged()
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!packages.length) return <Empty>עוד לא הועלו חבילות</Empty>
  return (
    <ul aria-label="החבילות" className="flex flex-col">
      {packages.map((p) => (
        <PackageRow key={`${p.packageId}#${p.part}`} p={p} busy={busy === p} onToggle={() => toggle(p)} onRemove={() => remove(p)} />
      ))}
    </ul>
  )
}

export default function UploadTab({ onChanged }) {
  const [packages, setPackages] = useState(null)
  const load = useCallback(async () => {
    try {
      setPackages((await getJson('/packages')).packages)
    } catch {
      setPackages([])
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    load()
  }, [load])
  const changed = useCallback(() => {
    load()
    onChanged?.()
  }, [load, onChanged])

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info" role={null}>
        במחשב האימון בוחרים מה לייצא ולאיזה צורך, והוא בונה קובץ ZIP. אין מה לבחור כאן: כל פריט בקובץ נושא איתו מאיזה ספר ומאיזה
        מסלול הוא בא, וכך גם יחזור. קובץ שהועלה לחלק הלא-נכון — האתר מזהה ומודיע. העלאה חוזרת של אותו קובץ לא משכפלת דבר.
      </Notice>
      <div className="grid gap-4 lg:grid-cols-3">
        {['ocr', 'router', 'frames'].map((s) => (
          <UploadCard key={s} section={s} onDone={changed} />
        ))}
      </div>
      <Card title="החבילות באתר" icon="inventory">
        {packages === null ? <ListLoading rows={2} label="טוען את החבילות…" /> : <PackagesList packages={packages} onChanged={changed} />}
      </Card>
    </div>
  )
}
