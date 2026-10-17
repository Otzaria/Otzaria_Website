import { cx } from '@/components/ui/cx'

type Panel = { title: string; lines: string[] }

/**
 * "לפני / אחרי" — שני בלוקים של טקסט גולמי זה לצד זה (בנייד — זה מתחת לזה). הכותרת אומרת את
 * המשמעות; הגוון (שגיאה/הצלחה) מחזק בלבד. השורות — טקסט פשוט ב-pre (שורה = שורה).
 */
export default function DocsBeforeAfter({ before, after }: { before: Panel; after: Panel }) {
  const panels = [
    { ...before, tone: 'before' as const },
    { ...after, tone: 'after' as const }
  ]
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {panels.map((panel) => (
        <div key={panel.tone} className="min-w-0">
          <h3 className={cx('mb-2 text-title-lg', panel.tone === 'before' ? 'text-error' : 'text-success')}>{panel.title}</h3>
          <pre
            className={cx(
              // unicode-bidi: plaintext — כיוון לכל שורה לפי תוכנה, כך שתגיות כמו <h1>…</h1> לא מתהפכות; היישור נשאר לימין
              'scrollbar-thin overflow-x-auto whitespace-pre-wrap rounded-e-card rounded-s-none border-s-4 p-4 text-right font-sans text-body-sm text-on-surface [unicode-bidi:plaintext]',
              panel.tone === 'before' ? 'border-error bg-error-container/40' : 'border-success bg-success-container/40'
            )}
          >
            {panel.lines.join('\n')}
          </pre>
        </div>
      ))}
    </div>
  )
}
