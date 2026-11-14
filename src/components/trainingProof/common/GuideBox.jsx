'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AppIcon from '@/components/ui/AppIcon'
import { apiGet } from '@/lib/api-utils'

// "הוראות ההגהה" של החלק — נטענות מ-TrainingProofGuide בפתיחה הראשונה (בעל הפרויקט
// עורך אותן במסך הניהול). סגור כברירת-מחדל, כדי לא לדחוק את השורות למטה.
export default function GuideBox({ section }) {
  const [state, setState] = useState({ loaded: false, markdown: '', error: '' })

  const onToggle = (e) => {
    if (!e.currentTarget.open || state.loaded) return
    apiGet(`/api/training-proof/guide/${section}`)
      .then((d) => setState({ loaded: true, markdown: d.markdown || '', error: '' }))
      .catch(() => setState({ loaded: false, markdown: '', error: 'טעינת ההוראות נכשלה — סגרו ופתחו שוב' }))
  }

  return (
    <details className="rounded-xl bg-surface-container-low px-4 py-2" onToggle={onToggle}>
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-primary">
        <AppIcon name="menu_book" className="text-lg" />
        הוראות ההגהה
      </summary>
      <div className="prose-sm mt-2 flex flex-col gap-2 text-body-md text-on-surface [&_h2]:text-title-md [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:ps-5">
        {state.error ? (
          <p className="text-error">{state.error}</p>
        ) : !state.loaded ? (
          <p className="text-on-surface-variant">טוען…</p>
        ) : state.markdown.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.markdown}</ReactMarkdown>
        ) : (
          <p className="text-on-surface-variant">עוד לא נכתבו הוראות לחלק הזה.</p>
        )}
      </div>
    </details>
  )
}
