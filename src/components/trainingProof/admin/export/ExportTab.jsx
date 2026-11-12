'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAsk } from '../useAsk'
import { SECTION_LABELS, SCRIPT_LABELS, OCR_ACTION_LABELS } from '@/lib/trainingProof/vocab'
import { API, getJson, fmt, fmtDate } from '../api'
import Button from '@/components/ui/Button'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'
import Notice from '@/components/ui/Notice'
import { Card, Empty, Muted, SECTION_ICONS, Tag } from '../bits'
import { TD, TH } from '../proofStyles'

// לשונית "הורדות" (docs/75 ה-13; docs/76 §5): ZIP לכל חלק — רק מה שאושר, בלי תמונות.
// אחרי שהשרת סיים לשלוח את הקובץ, החומר נמחק מהאתר; נשאר רק יומן של כמה הורד ומתי.

function what(section, s) {
  if (!s?.count) return 'אין כרגע חומר מאושר להורדה.'
  const join = (o, labels) =>
    Object.entries(o || {})
      .filter(([, n]) => n)
      .map(([k, n]) => `${labels[k] || k} ${fmt(n)}`)
      .join(' · ')
  if (section === 'ocr') return `לפי כתב: ${join(s.byTrack, SCRIPT_LABELS)}. לפי מה שסומן: ${join(s.byAction, OCR_ACTION_LABELS)}.`
  if (section === 'router') return `לפי כתב: ${join(s.byLabel, { ...SCRIPT_LABELS, '': 'פסול' })}.`
  return `${fmt(s.count)} עמודים מ-${fmt(s.books?.length)} ספרים (${(s.books || []).map((b) => `${b.alias}: ${b.pages}`).join(' · ')}).`
}

export default function ExportTab({ onChanged }) {
  const { showAlert, ask } = useAsk()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => {
    try {
      setData(await getJson('/export'))
    } catch (e) {
      setData({ sections: {}, log: [], error: e.message })
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    load()
  }, [load])

  const download = async (section) => {
    const s = data.sections[section]
    const yes = await ask(
      `להוריד את ${SECTION_LABELS[section]}?`,
      `${fmt(s.count)} פריטים מאושרים יירדו כקובץ ZIP. מיד כשההורדה תסתיים הם יימחקו מהאתר (הטקסט והתמונות). שמרו את הקובץ אצלכם וייבאו אותו בתחנה: "ייבוא מהאתר".`,
      'הורד'
    )
    if (!yes) return
    setBusy(section)
    try {
      const res = await fetch(`${API}/export/${section}`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'ההורדה נכשלה — שום דבר לא נמחק')
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || `training-proof-${section}.zip`
      const n = Number(res.headers.get('x-item-count') || 0)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      showAlert('ירד', `${fmt(n)} פריטים בקובץ ${name}. הם נמחקים עכשיו מהאתר.`)
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(null)
      // המחיקה רצה בשרת מיד אחרי השליחה — רגע, ואז רענון
      setTimeout(() => {
        load()
        onChanged?.()
      }, 800)
    }
  }

  if (!data) return <ListLoading rows={3} label="טוען…" />
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info" role={null}>
        יורד רק מה שאישרתם, ואחרי ההורדה הוא נמחק מהאתר (התמונות והטקסט) — באתר נשאר רק יומן של כמה הורד ומתי. במחשב האימון:
        &quot;ייבוא מהאתר&quot; — כל פריט חוזר לאותו ספר ולאותו מסלול שממנו יצא, כמאושר. שורות שסומנו &quot;הכתב שגוי&quot; נכנסות
        לתור של נתב הכתב.
      </Notice>
      <ErrorNotice text={data.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        {['ocr', 'router', 'frames'].map((s) => {
          const x = data.sections[s] || { count: 0 }
          return (
            <Card key={s} title={SECTION_LABELS[s]} icon={SECTION_ICONS[s]}>
              <div className="flex">
                <Tag tone={x.count ? 'ok' : 'muted'}>{fmt(x.count)} מאושרים, ממתינים להורדה</Tag>
              </div>
              <Muted className="flex-1">{what(s, x)}</Muted>
              <Button
                variant="tonal"
                size="sm"
                icon="download"
                className="self-start"
                disabled={!x.count || x.busy || (!!busy && busy !== s)}
                loading={busy === s}
                onClick={() => !busy && download(s)}
              >
                {busy === s ? 'מוריד…' : x.busy ? 'הורדה אחרת רצה' : 'הורד ZIP'}
              </Button>
            </Card>
          )
        })}
      </div>
      <Card title="יומן ההורדות" icon="history">
        {!data.log.length ? (
          <Empty>עוד לא הורד דבר</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-body-md">
              <caption className="sr-only">יומן ההורדות</caption>
              <thead className="border-b border-outline-variant">
                <tr>
                  <th scope="col" className={TH}>מתי</th>
                  <th scope="col" className={TH}>חלק</th>
                  <th scope="col" className={TH}>כמה</th>
                  <th scope="col" className={TH}>מי</th>
                  <th scope="col" className={TH}>מזהה</th>
                </tr>
              </thead>
              <tbody>
                {data.log.map((l) => (
                  <tr key={l.exportId} className="border-b border-outline-variant last:border-0">
                    <td className={`${TD} whitespace-nowrap`}>{fmtDate(l.at)}</td>
                    <td className={TD}>{SECTION_LABELS[l.section]}</td>
                    <td className={`${TD} tabular-nums`}>{fmt(l.count)}</td>
                    <td className={TD}>{l.by || '—'}</td>
                    <td className={`${TD} text-body-sm text-on-surface-variant`} dir="ltr">
                      {l.exportId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
