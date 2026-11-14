'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'

// המפתח שנוצר עכשיו — מוצג פעם אחת: העתקה ללוח ואזהרה. אחרי "העתקתי" (onDone) הוא נמחק מהדף, והאתר אינו יכול
// להציג אותו שוב (נשמר רק גיבוב שלו). כשהוא מופיע הפוקוס עובר אליו (הטופס שבו לחצו "צור מפתח" נעלם).

export default function TokenReveal({ token, name, onDone }) {
  const [copied, setCopied] = useState(null) // null | 'ok' | 'fail'
  const box = useRef(null)
  useEffect(() => {
    box.current?.focus()
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  return (
    <div data-testid="token-reveal" ref={box} tabIndex={-1} className="outline-none">
      <Notice tone="warning" role="alert" title={<>המפתח &quot;<bdi>{name}</bdi>&quot; נוצר — העתק אותו עכשיו. זו הפעם היחידה שהוא מוצג.</>}>
        <p>
          שמור אותו כמו סיסמה: מי שמחזיק בו יכול לקרוא, להכריע ולהעלות בצורת הדף בשמך (לפי ההרשאות שבחרת). אל תשלח אותו
          בדוא&quot;ל או בצ&apos;אט. אם אבד או דלף — בטל אותו כאן וצור חדש.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code dir="ltr" data-testid="token-value" className="select-all break-all rounded-(--radius-control) bg-surface px-3 py-2 font-mono text-body-sm text-on-surface">
            {token}
          </code>
          <Button variant="tonal" size="sm" icon={copied === 'ok' ? 'check' : 'content_copy'} onClick={copy}>
            {copied === 'ok' ? 'הועתק' : 'העתק'}
          </Button>
        </div>
        {copied === 'fail' && <p className="mt-2 text-error">ההעתקה נכשלה — סמן את המפתח והעתק ידנית (Ctrl+C).</p>}
        <div className="mt-3">
          <Button variant="outlined" size="sm" onClick={onDone}>העתקתי — הסתר את המפתח</Button>
        </div>
      </Notice>
    </div>
  )
}
