'use client'

import TextDiff from './TextDiff'

const EVENT_LABELS = {
  report_received: 'הדיווח נקלט',
  claimed: 'נלקח לטיפול',
  released: 'שוחרר',
  reassigned: 'הועבר למטפל',
  approved: 'אושר',
  rejected: 'נדחה',
  closed_manual: 'נסגר ידנית',
  reopened: 'נפתח מחדש',
  closed_already_fixed: 'נסגר — כבר תוקן',
  handoff_manual: 'הועבר לטיפול ידני',
  verify_retry_scheduled: 'נקבע ניסיון חוזר מול השירות',
  verify_pending: 'השירות עדיין מעבד',
  verify_job_superseded: 'בדיקה אוטומטית בוטלה',
  service_decision: 'החלטת שירות הבדיקה',
  service_response_ignored: 'תשובת שירות מאוחרת (תיעוד בלבד)',
  resubmitted_to_service: 'נשלח מחדש לשירות',
  source_chosen_preview: 'נבחר מקור ידנית (תצוגה)',
  approval_revoked_by_claim: 'אישור שלא פורסם נפסל בלקיחה מחדש',
  publish_outcome: 'תוצאת פרסום',
  publish_conflict: 'התנגשות בפרסום',
  publish_failed: 'הפרסום נכשל',
  publish_reconciled: 'בדיקת תוצאת פרסום לא ידועה',
  pr_merged: 'ה-PR מוזג',
  pr_closed_unmerged: 'ה-PR נסגר בלי מיזוג',
}

const AUTHOR = { user: 'המשתמש', service: 'שירות הבדיקה', volunteer: 'מתנדב' }

function Section({ title, children }) {
  return (
    <section className="glass rounded-xl p-4">
      <h3 className="font-bold mb-3">{title}</h3>
      {children}
    </section>
  )
}

export default function HistoryPanel({ detail }) {
  const { report, publishAttempts, history, changes } = detail
  return (
    <div className="space-y-4">
      {report.proposals.length > 1 && (
        <Section title="גרסאות ההצעה">
          <div className="space-y-4">
            {report.proposals.map((p) => (
              <div key={p.revision} className={p.revision === report.currentRevision ? '' : 'opacity-70'}>
                <div className="text-xs text-on-surface/60 mb-1">
                  גרסה {p.revision} · {AUTHOR[p.author] || p.author}{p.authorName ? ` (${p.authorName})` : ''}{p.revision === report.currentRevision ? ' · נוכחית' : ''}
                  {p.targetPath ? ` · יעד ידני: ${p.targetPath} שורה ${p.targetLineIndex + 1}` : ''}
                </div>
                <TextDiff before={p.originalLine} after={p.newLine ?? p.originalLine} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {report.decisions.length > 0 && (
        <Section title="החלטות">
          <ul className="space-y-1 text-sm">
            {report.decisions.map((d, i) => (
              <li key={i} className={d.stale ? 'text-on-surface/50 line-through' : ''}>
                {new Date(d.at).toLocaleString('he-IL')} · {d.source === 'service' ? 'שירות' : d.actorName || 'מתנדב'} · <b>{d.decision}</b>
                {d.scope ? ` (${d.scope})` : ''}{d.reasonCode ? ` · ${d.reasonCode}` : ''}{d.message ? ` · ${d.message}` : ''}{d.stale ? ' · תיעוד בלבד' : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(publishAttempts.length > 0 || changes.length > 0) && (
        <Section title="חבילות שינוי וניסיונות פרסום">
          <ul className="space-y-1 text-sm">
            {changes.map((c) => (
              <li key={c.changeId}>חבילה <span dir="ltr">{c.changeId}</span> · גרסה {c.revision} · {c.createdBy === 'service' ? 'שירות' : 'מתנדב'} · <span dir="ltr">{c.path}</span> שורה {c.lineIndex + 1}</li>
            ))}
            {publishAttempts.map((a) => (
              <li key={a.attemptId}>
                ניסיון <span dir="ltr">{a.attemptId}</span> · {a.mode} · <b>{a.status}</b>
                {a.prUrl?.startsWith('https://github.com/') && <> · <a href={a.prUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline">PR #{a.prNumber}</a></>}
                {a.commitSha && <> · <span dir="ltr">{a.commitSha.slice(0, 10)}</span></>}
                {a.error && <> · {a.error}</>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="יומן פעולות">
        <ul className="space-y-1 text-sm">
          {history.map((h, i) => (
            <li key={i}>
              {new Date(h.at).toLocaleString('he-IL')} · {EVENT_LABELS[h.type] || h.type}
              {h.actorName ? ` · ${h.actorName}` : h.actorKind === 'worker' ? ' · מערכת' : ''}
              {h.data?.reason ? ` · ${h.data.reason}` : ''}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
