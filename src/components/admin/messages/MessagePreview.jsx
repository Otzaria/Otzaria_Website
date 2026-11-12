/**
 * תצוגה מקדימה בטופס "הודעה חדשה": מה הנמען יראה — הנושא, ממי, והטקסט כמו שנכתב (שורות נשמרות). לפני שכותבים —
 * הסבר קצר במקום כרטיס ריק.
 * @param {{ subject: string, text: string, senderName?: string }} props
 */
export default function MessagePreview({ subject, text, senderName }) {
  const empty = !subject.trim() && !text.trim()
  return (
    <section aria-label="תצוגה מקדימה" className="flex flex-col gap-2">
      <h3 className="text-label-lg text-on-surface">תצוגה מקדימה</h3>
      {empty ? (
        <p className="rounded-(--radius-control) bg-surface-container-low p-4 text-body-sm text-on-surface-variant">כאן יופיע מה שהנמען יראה.</p>
      ) : (
        <div className="rounded-(--radius-control) bg-surface p-4">
          <p className="text-title-sm text-on-surface [overflow-wrap:anywhere]">{subject.trim() || 'בלי נושא'}</p>
          {senderName && <p className="mt-0.5 text-body-sm text-on-surface-variant">מאת {senderName}</p>}
          <p className="mt-3 whitespace-pre-wrap text-body-md text-on-surface [overflow-wrap:anywhere]">{text}</p>
        </div>
      )}
    </section>
  )
}
