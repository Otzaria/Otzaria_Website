// מי שאינו רשאי להגיה (לא מאומת ולא מנהל ספרייה/OCR) — אותה הודעה כמו בדף
// המתנדב (/library/page-proof); השרת בודק את אותו כלל (requireProofSession)
export default function ProofAccessNotice() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-warning-alt-200 bg-warning-alt-50 p-4 text-warning-alt-800">
      <span aria-hidden="true" className="material-symbols-outlined">info</span>
      רק משתמשים עם כתובת אימייל מאומתת יכולים להגיה עמודים.
    </div>
  )
}
