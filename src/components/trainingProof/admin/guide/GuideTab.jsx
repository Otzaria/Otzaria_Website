'use client'

import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useDialog } from '@/components/providers/DialogContext'
import { SECTION_LABELS } from '@/lib/trainingProof/vocab'
import { getJson, sendJson, fmtDate } from '../api'
import { Card, Empty, SectionSwitch } from '../bits'

// לשונית "הוראות ההגהה": עורך לכל חלק (Markdown), תצוגה מקדימה כפי שהמגיה יראה,
// ושמירה ל-TrainingProofGuide. בלי HTML גולמי — רק Markdown.

// נקודת-פתיחה כשעוד לא נשמרו הוראות לחלק (לא נשמרת עד שלוחצים "שמור")
export const STARTER = {
  ocr: '## מה עושים\n- משווים את התמונה לטקסט, ומסמנים: 1 נכון · 2 תקן · 3 דלג · 4 לא קריא · 5 הכתב שגוי.\n- השורה מוגהת כולה, גם בשורה מעורבת.\n\n## חשוב\n- מעתיקים בדיוק מה שכתוב, גם שגיאת-דפוס.',
  router: '## מה עושים\n- בוחרים את הכתב של השורה: 1 מרובע · 2 רש"י · 3 לועזית · 4 מעורבת. 0 = פסול.\n- בשורה מעורבת — כתב לכל מילה (Tab עובר למילים).',
  frames: '## מה עושים\n- לוקחים ספר שלם, ומתקנים את המסגרות בכל עמוד: תפקיד (1–9), זרם, סדר קריאה.\n- גרירה על מקום ריק מציירת מסגרת חדשה. Enter — העמוד נכון.',
}

const md = {
  h2: (p) => <h2 className="mt-3 text-lg font-bold" {...p} />,
  h3: (p) => <h3 className="mt-2 font-bold" {...p} />,
  ul: (p) => <ul className="list-disc ps-5" {...p} />,
  ol: (p) => <ol className="list-decimal ps-5" {...p} />,
  p: (p) => <p className="my-1.5" {...p} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-info-700 underline">
      {children}
    </a>
  ),
}

export function GuidePreview({ markdown }) {
  return (
    <div className="text-sm leading-7">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md} skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

export default function GuideTab() {
  const { showAlert } = useDialog()
  const [section, setSection] = useState('ocr')
  const [saved, setSaved] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      setSaved((await getJson('/guide')).guides)
    } catch (e) {
      setSaved({})
      showAlert('שגיאה', e.message)
    }
  }, [showAlert])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    load()
  }, [load])

  if (!saved) return <Empty>טוען…</Empty>
  const cur = saved[section]
  const text = drafts[section] ?? cur?.markdown ?? STARTER[section]
  const dirty = drafts[section] !== undefined && drafts[section] !== (cur?.markdown ?? '')

  const save = async () => {
    setBusy(true)
    try {
      await sendJson('/guide', { section, markdown: text }, 'PUT')
      setDrafts((d) => {
        const n = { ...d }
        delete n[section]
        return n
      })
      await load()
      showAlert('נשמר', 'ההוראות נשמרו — המגיהים יראו אותן בכניסה הבאה')
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionSwitch value={section} onChange={setSection} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title={`עריכה — ${SECTION_LABELS[section]}`} icon="edit_note">
          <p className="text-xs text-on-surface/60">
            <code dir="ltr">##</code> בתחילת שורה = כותרת · <code dir="ltr">-</code> = סעיף ברשימה · <code dir="ltr">**…**</code> = מודגש
          </p>
          <textarea
            aria-label="טקסט ההוראות"
            dir="rtl"
            value={text}
            onChange={(e) => setDrafts((d) => ({ ...d, [section]: e.target.value }))}
            className="min-h-80 w-full rounded-md border border-surface-variant bg-surface p-2 font-mono text-sm leading-6"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40" disabled={busy || (!dirty && !!cur)} onClick={save}>
              <span className="material-symbols-outlined text-base">save</span> שמור ופרסם למגיהים
            </button>
            <span className="text-xs text-on-surface/60">
              {cur ? `עודכן לאחרונה: ${fmtDate(cur.updatedAt)}${cur.by ? ` · ${cur.by}` : ''}` : 'עוד לא נשמרו הוראות לחלק הזה — זו נקודת-פתיחה'}
              {dirty && ' · יש שינויים שלא נשמרו'}
            </span>
          </div>
        </Card>
        <Card title="כך זה ייראה למגיה" icon="visibility">
          <GuidePreview markdown={text} />
        </Card>
      </div>
    </div>
  )
}
