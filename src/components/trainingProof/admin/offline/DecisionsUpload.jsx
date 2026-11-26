'use client'

import { useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import ErrorNotice from '@/components/ui/ErrorNotice'
import { SECTION_LABELS } from '@/lib/trainingProof/vocab'
import { sendJson } from '../api'
import { useAsk } from '../useAsk'
import DecisionsReport from './DecisionsReport'

// העלאת קובץ-ההחלטות (tpd/1): הקובץ נקרא בדפדפן, נבדק בקצרה, ונשלח לשרת — שם כל החלטה מוחלת
// רק אם הפריט עדיין ממתין וזמן-ההגשה זהה. אחרי ההחלה — הדוח, ורענון הסקירה.
export default function DecisionsUpload({ section, onApplied }) {
  const { ask } = useAsk()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [report, setReport] = useState(null)

  const onFile = async (file) => {
    if (!file) return
    setErr('')
    setReport(null)
    let body
    try {
      body = JSON.parse(await file.text())
    } catch {
      setErr('הקובץ אינו קובץ-החלטות (לא JSON)')
      return
    }
    if (body?.contract !== 'tpd/1' || !Array.isArray(body.decisions)) {
      setErr('זה לא קובץ-החלטות של "אישור בלי אינטרנט"')
      return
    }
    const other = body.section && body.section !== section ? ` (הקובץ שייך ל"${SECTION_LABELS[body.section] || body.section}")` : ''
    const yes = await ask(
      `להחיל ${body.decisions.length.toLocaleString('he-IL')} החלטות?`,
      `מהקובץ ${file.name}${other}. כל החלטה מוחלת רק אם הפריט עדיין ממתין ולא הוגש מחדש מאז ההורדה; מה שכבר טופל באתר — מדולג.`,
      'החל'
    )
    if (!yes) return
    setBusy(true)
    try {
      const r = await sendJson('/offline/decisions', body)
      setReport(r)
      onApplied?.(r)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        data-testid="tp-offline-file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          onFile(f)
        }}
      />
      <Button variant="tonal" size="sm" icon="upload_file" className="self-start" loading={busy} onClick={() => input.current?.click()}>
        העלה קובץ-החלטות
      </Button>
      <ErrorNotice text={err} />
      {report && <DecisionsReport report={report} />}
    </div>
  )
}
