'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Notice from '@/components/ui/Notice'
import FileDropZone from '@/components/plugins/form/FileDropZone'
import { LAYOUT_KIND_LABELS, importSummaryText } from '@/lib/adminTrainingScreen/ocrLayoutQuery'
import { importLayoutBatch } from './trainingApi'

const isZip = (file) => /\.zip$/i.test(file?.name || '')

/**
 * מגירת "ייבא עמודים": קובץ ZIP שהפיק פרויקט ה-OCR (export_labeling_batch.py) — בחירה או גרירה, ואחרי הייבוא
 * סיכום: כמה נקלטו, כמה דולגו, ושגיאות. אותה בקשה כמו קודם (POST /api/admin/ocr-layout/import עם file).
 * @param {{ onClose: () => void, onImported: () => void }} props
 */
export default function ImportBatchDrawer({ onClose, onImported }) {
  const id = useId()
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState(null)
  // אחרי הייבוא "ייבא" כבוי (אין קובץ) — הפוקוס עובר ל"סגור" ולא נופל לגוף הדף
  const closeRef = useRef(null)
  useEffect(() => {
    if (summary) closeRef.current?.focus()
  }, [summary])

  const pick = (f) => {
    setSummary(null)
    if (f && !isZip(f)) {
      setFile(null)
      setError('בחר קובץ ZIP.')
      return
    }
    setError('')
    setFile(f || null)
  }
  const close = () => { if (!importing) onClose() }
  const submit = async () => {
    if (!file) {
      setError('בחר קובץ ZIP.')
      return
    }
    setImporting(true)
    setError('')
    try {
      const data = await importLayoutBatch(file)
      setSummary(data.summary)
      setFile(null)
      onImported()
    } catch (e) {
      setError(e?.message || 'הייבוא נכשל.')
    } finally {
      setImporting(false)
    }
  }
  const text = importSummaryText(summary, LAYOUT_KIND_LABELS)

  return (
    <Drawer
      title="ייבא עמודים לתיוג"
      subtitle="קובץ ZIP מפרויקט ה-OCR, עם העמודים וההצעות של המכונה."
      onClose={close}
      dismissible={!importing}
      footer={(
        <>
          <Button ref={closeRef} variant="text" size="sm" onClick={close} softDisabled={importing}>{summary ? 'סגור' : 'ביטול'}</Button>
          <Button variant="filled" size="sm" icon="upload_file" onClick={submit} loading={importing} softDisabled={importing} disabled={!file && !importing}>
            {importing ? 'מייבא…' : 'ייבא'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        <FileDropZone
          id={id}
          label="קובץ ZIP"
          icon="folder_zip"
          accept=".zip"
          hint={file ? `נבחר: ${file.name}` : 'גרור לכאן את הקובץ, או בחר אותו מהמחשב.'}
          error={error || null}
          onChange={(e) => {
            pick(e.target.files?.[0])
            // כדי שבחירה חוזרת של אותו קובץ (למשל אחרי ייבוא) תיקלט שוב
            e.target.value = ''
          }}
          onDropFiles={(files) => pick(files?.[0])}
        />
        {/* אזור קבוע שהסיכום נכנס אליו — כך קורא המסך מכריז עליו */}
        <div aria-live="polite">
        {summary && (
          <Notice tone="info" title="הייבוא הסתיים">
            {text.lines.map((l, i) => <p key={i}>{l}</p>)}
            {text.errors.length > 0 && (
              <div className="mt-2 text-error">
                <p>שגיאות ({summary.errors.length}):</p>
                <ul className="list-disc ps-5">{text.errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul>
              </div>
            )}
          </Notice>
        )}
        </div>
      </div>
    </Drawer>
  )
}
