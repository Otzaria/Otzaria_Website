/**
 * הגוף של חלון "לשנות את התפקיד?": מה התפקיד החדש יראה בניהול (לפי התפקיד בלבד — צוות לא משתנה), מה ייעלם,
 * מתי זה נכנס לתוקף, ובאדום — אזהרה כשהמנהל מוריד את עצמו. הנתונים מ-roleChangeConfirm (lib/adminUsersScreen/userTerms).
 *
 * @param {{ confirm: ReturnType<typeof import('@/lib/adminUsersScreen/userTerms').roleChangeConfirm> }} props
 */
export default function RoleChangeBody({ confirm }) {
  return (
    <div className="flex flex-col gap-3">
      <p>{confirm.body}</p>
      {confirm.details.length > 0 && (
        <ul className="mx-auto flex max-w-measure list-disc flex-col gap-1 ps-5 text-start text-body-sm">
          {confirm.details.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {confirm.lost && <p className="text-body-sm">{confirm.lost}</p>}
      <p className="text-body-sm">{confirm.note}</p>
      {confirm.warning && <p className="text-error">{confirm.warning}</p>}
    </div>
  )
}
