'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { loginHref } from '@/components/admin/list/adminRequest'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { questionsFromText } from '@/lib/finishQuestions'
import { cleanSections, newSectionForm, sameSections, toSectionForms, untitledSectionKeys } from '@/lib/adminBooks/instructions'
import BooksHeader from './BooksHeader'
import FinishQuestionsFields from './FinishQuestionsFields'
import InstructionSectionsEditor from './InstructionSectionsEditor'
import { saveGlobalInstructions } from './booksApi'

/**
 * לשונית "הנחיות כלליות" (היה "הנחיות גלובליות", בחלון): טופס מלא בעמוד — סעיפים עם כותרת ושורה לכל
 * הנחיה — ושמירה בשורה דביקה בתחתית. ההנחיות מופיעות בכל ספר, מתחת להנחיות העריכה של הספר.
 * סעיף בלי כותרת לא נשמר (כמו קודם) — והטופס אומר את זה ליד הסעיף, במקום שייעלם בשקט.
 * מתחת לסעיפים — שאלות הבסיס בסיום עמוד (lib/finishQuestions.js), נשמרות באותה שמירה.
 * initialError — הטעינה בשרת נכשלה: שגיאה ו"נסה שוב" (רענון), ולא טופס ריק שאפשר לשמור בטעות מעל הקיים.
 *
 * @param {{ initialInstructions: { sections: any[] } | null, initialFinishQuestions?: { items: string[] } | null, initialError?: boolean }} props
 */
export default function GlobalInstructionsScreen({ initialInstructions, initialFinishQuestions = null, initialError = false }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [saved, setSaved] = useState(() => toSectionForms(initialInstructions?.sections))
  const [sections, setSections] = useState(saved)
  const [savedQuestions, setSavedQuestions] = useState(() => (initialFinishQuestions?.items || []).join('\n'))
  const [questionsText, setQuestionsText] = useState(savedQuestions)
  const [saving, setSaving] = useState(false)
  const questionsDirty = questionsFromText(questionsText).join('\n') !== questionsFromText(savedQuestions).join('\n')
  const dirty = !sameSections(sections, saved) || questionsDirty
  const untitled = untitledSectionKeys(sections)

  // שינויים שלא נשמרו — "לצאת בלי לשמור?" בכל קישור (לשוניות, סרגל, כותרת) וב"אחורה", ואזהרת הדפדפן ברענון / סגירה
  useUnsavedChangesGuard(dirty || saving, () => confirm(unsavedConfirm('השינויים בהנחיות הכלליות לא נשמרו.')))

  const save = async () => {
    if (saving || !dirty) return
    setSaving(true)
    try {
      const clean = cleanSections(sections)
      const questions = questionsFromText(questionsText)
      await saveGlobalInstructions({ ...(initialInstructions || {}), sections: clean }, { items: questions })
      const next = toSectionForms(clean)
      setSaved(next)
      setSections(next)
      setSavedQuestions(questions.join('\n'))
      setQuestionsText(questions.join('\n'))
      toast.show({ message: 'ההנחיות הכלליות נשמרו' })
    } catch (e) {
      toast.show(e?.sessionExpired
        ? { tone: 'error', message: e.message, action: { label: 'התחבר', href: loginHref('/library/admin/books/instructions') } }
        : { tone: 'error', message: e?.message || 'לא הצלחנו לשמור את ההנחיות הכלליות.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BooksHeader tab="instructions" />
      {initialError ? (
        <ErrorState title="לא הצלחנו לטעון את ההנחיות הכלליות" description="נסה שוב בעוד רגע." onRetry={() => window.location.reload()} />
      ) : (
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
          <InstructionSectionsEditor
            sections={sections}
            onChange={setSections}
            onAdd={() => setSections((s) => [...s, newSectionForm()])}
            disabled={saving}
            untitled={untitled}
            requireTitle
          />
          <FinishQuestionsFields text={questionsText} onTextChange={setQuestionsText} disabled={saving} />
          <div className="sticky bottom-0 z-(--z-raised) flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant bg-background py-3">
            {dirty && <p className="me-auto text-body-sm text-on-surface-variant">יש שינויים שלא נשמרו</p>}
            <Button variant="text" size="sm" onClick={() => { setSections(saved); setQuestionsText(savedQuestions) }} disabled={!dirty || saving}>בטל שינויים</Button>
            <Button type="submit" variant="filled" size="sm" icon="save" loading={saving} disabled={!dirty}>{saving ? 'שומר…' : 'שמור'}</Button>
          </div>
        </form>
      )}
      {confirmElement}
    </div>
  )
}
