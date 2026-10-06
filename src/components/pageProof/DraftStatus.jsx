'use client'

// "נשמר" — הטיוטה של העמוד: בדפדפן תמיד (מיד, בכל שינוי), ובאתר אחרי השהיה קצרה (useServerDraft). שמירה באתר שנכשלה
// — "לא נשמר בשרת" ליד "נשמר", עם הסיבה בריחוף; העבודה שמורה בדפדפן ותישלח שוב. status — {state, at, error}.

const SERVER = {
  idle: null,
  pending: { icon: 'cloud_sync', text: 'יישמר באתר בעוד רגע', cls: 'text-on-surface/60' },
  saving: { icon: 'cloud_sync', text: 'שומר באתר…', cls: 'text-on-surface/60' },
  saved: { icon: 'task_alt', text: 'נשמר באתר', cls: 'text-success-700' },
  error: { icon: 'cloud_off', text: 'לא נשמר בשרת', cls: 'text-danger-700' },
  lost: { icon: 'cloud_off', text: 'לא נשמר בשרת — העמוד כבר אינו בטיפולכם', cls: 'text-danger-700' },
  reload: { icon: 'sync_problem', text: 'לא נשמר בשרת — העמוד עודכן, טענו אותו מחדש', cls: 'text-danger-700' },
  stale: { icon: 'sync_problem', text: 'לא נשמר בשרת — הטיוטה נשמרה בינתיים בלשונית או במחשב אחר', cls: 'text-danger-700' },
}

const TITLE = {
  error: 'השמירה באתר נכשלה; העבודה שמורה בדפדפן הזה, ותישלח שוב לבד בעוד כמה שניות.',
  lost: 'מי שמחזיק בעמוד שומר את הטיוטה שלו באתר. העבודה שלכם שמורה בדפדפן הזה בלבד — תפסו את העמוד שוב ברשת-העמודים כדי להמשיך.',
  reload: 'העמוד הוחלף בגרסה חדשה (חזר מזיהוי-מחדש). טענו אותו מחדש — מה שעדיין חל מהטיוטה עובר אליו.',
  stale: 'טענו את העמוד מחדש: העבודה מכאן שמורה בדפדפן הזה, ונכנסת לעורך אם היא חדשה מזו שבאתר — כך שתי לשוניות לא דורסות זו את זו.',
}

// onReload — "טען מחדש" (במצבים reload/stale)
export default function DraftStatus({ status, className = '', onReload = null }) {
  const srv = SERVER[status?.state] || null
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${className}`} data-testid="draft-status" aria-live="polite">
      <span className="inline-flex items-center gap-1 text-on-surface/70" title="כל שינוי נשמר מיד בדפדפן הזה">
        <span aria-hidden="true" className="material-symbols-outlined text-sm">done</span>
        נשמר
      </span>
      {srv && (
        <span
          className={`inline-flex items-center gap-1 ${srv.cls}`}
          title={[TITLE[status.state], status.error].filter(Boolean).join(' · ') || undefined}
          data-server-state={status.state}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm">{srv.icon}</span>
          {srv.text}
        </span>
      )}
      {onReload && (status?.state === 'stale' || status?.state === 'reload') && (
        <button type="button" onClick={onReload} className="rounded px-1.5 py-0.5 font-bold text-primary-700 underline hover:bg-primary-50" data-testid="draft-reload">
          טען מחדש
        </button>
      )}
    </span>
  )
}
