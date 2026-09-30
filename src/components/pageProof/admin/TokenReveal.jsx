'use client'

import { useState } from 'react'

// המפתח שנוצר עכשיו — מוצג פעם אחת: העתקה ללוח ואזהרה. אחרי "הסתר" (onDone) הוא נמחק
// מהדף, והאתר אינו יכול להציג אותו שוב (נשמר רק גיבוב שלו).

export default function TokenReveal({ token, name, onDone }) {
  const [copied, setCopied] = useState(null) // null | 'ok' | 'fail'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  return (
    <div role="alert" data-testid="token-reveal" className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-900">
      <p className="flex items-center gap-2 font-bold">
        <span className="material-symbols-outlined text-base">warning</span>
        המפתח &quot;<bdi>{name}</bdi>&quot; נוצר. העתיקו אותו עכשיו לתוכנת-הספר — זו הפעם היחידה שהוא מוצג.
      </p>
      <p className="mt-1">
        שמרו אותו כמו סיסמה: מי שמחזיק בו יכול לקרוא, לאשר ולייבא בהגהת-העמודים בשמכם (לפי ההרשאות שבחרתם). אל תשלחו אותו
        בדוא&quot;ל או בצ&apos;אט. אם אבד או דלף — בטלו אותו כאן וצרו חדש.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code dir="ltr" data-testid="token-value" className="select-all break-all rounded bg-surface px-2 py-1 font-mono text-xs text-on-surface">
          {token}
        </code>
        <button type="button" onClick={copy} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs text-on-primary hover:opacity-90">
          <span className="material-symbols-outlined text-sm">content_copy</span>
          {copied === 'ok' ? 'הועתק' : 'העתק'}
        </button>
      </div>
      {copied === 'fail' && <p className="mt-1 text-xs text-danger-700">ההעתקה נכשלה — סמנו את המפתח והעתיקו ידנית (Ctrl+C).</p>}
      <button type="button" onClick={onDone} className="mt-3 rounded-md border border-warning-400 px-3 py-1 text-xs hover:bg-warning-100">
        העתקתי — הסתר את המפתח
      </button>
    </div>
  )
}
