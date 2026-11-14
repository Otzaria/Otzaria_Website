'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { useDialog } from '@/components/providers/DialogContext'
import { applyLineOps } from '@/lib/tzuratHadaf/lineOps'
import HelpDialog, { HelpButton } from './HelpDialog'
import LinesStage from './LinesStage'
import OverviewStage from './OverviewStage'
import ReportDialog from './ReportDialog'
import ReviewStageBar from './ReviewStageBar'
import SubmitStage from './SubmitStage'
import TextStage from './TextStage'
import { AccessNotice } from './TzuratShell'
import { api } from './api'
import { FAST_PATH, STAGE_KEYS, pageStateUi, pagesPath, reviewPath } from './labels'
import { initHistory, pushHistory, redoHistory, undoHistory } from './linesLogic'
import { missingChecks, stageFromDraft, submitBody, workFromDraft, workSummary } from './reviewState'
import { useTzuratDraft } from './useTzuratDraft'

// בדיקת עמוד (?page=id): טעינת העמוד (GET pages/[id] — עמוד, מודל, שאלות הנוסח והטיוטה), חידוש ההחזקה בפתיחה
// (POST claim, כשהעמוד כבר בידיכם), ארבעת השלבים, שמירת הטיוטה בשרת, שחרור והגשה.
// מי שהעמוד אינו בידיו — צפייה בלבד (ובעמוד פנוי — כפתור "קח את העמוד").

const fmtUntil = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('he-IL', { weekday: 'long', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })
}

export default function ReviewShell({ pageId }) {
  const [data, setData] = useState(null)
  const [fail, setFail] = useState(null)
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    const r = await api.page(pageId)
    if (!r.ok) {
      setFail({ status: r.status, error: r.error })
      return
    }
    // העמוד בידיכם — כל פתיחה מחדשת את ההחזקה
    if (r.data.page?.state === 'mine' && !r.data.processing) {
      const c = await api.claim(pageId)
      if (c.ok && c.data.leasedUntil) r.data.page = { ...r.data.page, leasedUntil: c.data.leasedUntil }
    }
    setFail(null)
    setData(r.data)
    setVersion((v) => v + 1)
  }, [pageId])

  useEffect(() => {
    if (!pageId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [pageId, load])

  if (!pageId) return <AccessNotice status={404} error="לא נבחר עמוד. חזרו לרשת העמודים ובחרו עמוד." />
  if (fail) {
    return (
      <div className="flex flex-col gap-3">
        <AccessNotice status={fail.status} error={fail.status === 404 ? 'העמוד לא נמצא.' : fail.error} onRetry={load} />
        <Link href={pagesPath()} prefetch={false} className="font-bold text-primary hover:underline">
          לרשת העמודים
        </Link>
      </div>
    )
  }
  if (!data) return <p className="text-on-surface/60" role="status">טוען את העמוד...</p>
  return <ReviewWorkspace key={`${pageId}:${version}`} data={data} onReload={load} />
}

function withoutOps(w) {
  const rest = { ...w }
  delete rest.lineOps
  return rest
}

function ReviewWorkspace({ data, onReload }) {
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  const { page, items = [], draft = null, next = null, prev = null } = data
  const holder = page.state === 'mine'
  const [initial] = useState(() => ({ stage: stageFromDraft(draft), work: workFromDraft(draft?.state) }))
  const [stage, setStage] = useState(initial.stage)
  const [hist, setHist] = useState(() => initHistory(initial.work.lineOps))
  const [work, setWork] = useState(() => withoutOps(initial.work))
  const [reportEdit, setReportEdit] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const draftSaver = useTzuratDraft({ pageId: page.id, version: page.version, baseUpdatedAt: draft?.updatedAt || null, enabled: holder && !done && !data.processing })

  const fullWork = useMemo(() => ({ ...work, lineOps: hist.present }), [work, hist.present])
  const shownModel = useMemo(() => applyLineOps(page.model, hist.present).model, [page.model, hist.present])
  const summary = useMemo(() => workSummary(page.model, fullWork, items), [page.model, fullWork, items])
  const missing = missingChecks(work.checks)

  // מה שנטען (הטיוטה מהשרת, או עבודה ריקה) — לא לשלוח שוב עד שמשהו ישתנה. באותו סדר מפתחות כמו fullWork.
  useEffect(() => {
    draftSaver.seed(initial.stage, { ...withoutOps(initial.work), lineOps: initial.work.lineOps })
    // פעם אחת, בטעינה
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (holder && !done) draftSaver.update(stage, fullWork)
  }, [holder, done, stage, fullWork, draftSaver])

  const patch = (p) => setWork((w) => ({ ...w, ...p }))
  const toast = useCallback((msg) => showAlert('לא ניתן', msg), [showAlert])

  const saveReport = (report) => {
    setWork((w) => {
      const reports = [...w.reports]
      if (reportEdit?.index != null) reports[reportEdit.index] = report
      else reports.push(report)
      return { ...w, reports }
    })
    setReportEdit(null)
  }

  const claim = async () => {
    setBusy(true)
    const r = await api.claim(page.id)
    setBusy(false)
    if (r.ok) onReload()
    else showAlert('לא ניתן לקחת את העמוד', r.error)
  }

  const release = async () => {
    const ok = await showConfirm('שחרור העמוד', 'העמוד יחזור למאגר ומתנדב אחר יוכל לקחת אותו. מה שעשיתם בו עד עכשיו לא יוגש.', undefined, 'שחרור', 'ביטול')
    if (!ok) return
    setBusy(true)
    const r = await api.release(page.id)
    setBusy(false)
    if (r.ok) router.push(pagesPath(page.slug))
    else showAlert('שגיאה', r.error)
  }

  const submit = async () => {
    if (missing.length && !data.processing) return
    setSubmitting(true)
    const r = await api.submit(page.id, submitBody(fullWork, { round: page.round, version: page.version }))
    setSubmitting(false)
    if (r.ok) {
      setDone(r.data)
      window.scrollTo?.({ top: 0 })
    } else if (r.status === 409 && r.code === 'stale') {
      // העמוד יובא מחדש (בנייה חדשה, סבב חדש) מאז שנפתח — ההגשה לא נקלטה; הטיוטה נשמרת בשרת
      await draftSaver.flush()
      const reload = await showConfirm(
        'העמוד עודכן בינתיים',
        'מאז שפתחתם את העמוד נטענה לאתר בנייה חדשה שלו, ולכן ההגשה לא נקלטה. טענו את העמוד מחדש ובדקו אותו שוב. הסימונים מהבנייה הקודמת לא יוחלו אוטומטית על העמוד החדש.',
        undefined,
        'טעינה מחדש',
        'ביטול'
      )
      if (reload) onReload()
    } else {
      showAlert('ההגשה נכשלה', r.error)
      if (r.code === 'retry' || r.code === 'processing') onReload()
    }
  }

  if (done) {
    return (
      <div className="glass-strong flex flex-col items-center gap-4 rounded-2xl p-8 text-center" role="status" data-testid="submitted">
        <span aria-hidden="true" className="material-symbols-outlined text-6xl text-success-600">task_alt</span>
        <p className="text-2xl font-bold text-on-surface">הבדיקה הוגשה — תודה רבה!</p>
        <p className="text-on-surface/70">
          מנהל יבדוק את ההגשה. כשתאושר תקבלו 10 נקודות, והשינויים ייכנסו לבנייה הבאה של צורת הדף.
        </p>
        {done.warnings?.length > 0 && <p role="note">חלק משאלות הנוסח השתנו או טופלו בינתיים. התשובות המקוריות נשמרו לעיון המנהל בהגשה.</p>}
        <div className="flex flex-wrap justify-center gap-2">
          {next && (
            <Button href={reviewPath(next.id)} prefetch={false} icon="arrow_back">
              לדף הבא: {next.daf}
            </Button>
          )}
          <Button variant="outlined" href={pagesPath(page.slug)} prefetch={false} icon="grid_view">
            לרשת העמודים
          </Button>
          <Button variant="text" href={FAST_PATH} prefetch={false}>
            להחלטות מהירות
          </Button>
        </div>
      </div>
    )
  }

  if (data.processing) return (
    <div className="glass-strong flex flex-col gap-4 rounded-xl p-6" role="status">
      <p>שמירת ההגשה נעצרה. התוכן ששלחתם נשמר; המשיכו לשמור אותו מאותה נקודה.</p>
      <Button onClick={submit} disabled={submitting}>המשך שמירת ההגשה</Button>
    </div>
  )

  const ui = pageStateUi(page.state)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-frank text-2xl font-bold text-on-surface">
          {page.masechet} {page.daf}
        </h2>
        <Badge tone={ui.tone} icon={ui.icon}>
          {ui.label}
        </Badge>
        {page.round > 1 && <Badge>סבב {page.round}</Badge>}
        {holder && page.leasedUntil && <span className="text-sm text-on-surface/60">שמור לכם עד {fmtUntil(page.leasedUntil)} (שבת וחג אינם נספרים)</span>}
        <div className="ms-auto flex flex-wrap items-center gap-1">
          {prev && (
            <Button variant="text" size="sm" href={reviewPath(prev.id)} prefetch={false} icon="arrow_forward">
              {prev.daf}
            </Button>
          )}
          {next && (
            <Button variant="text" size="sm" href={reviewPath(next.id)} prefetch={false} iconEnd="arrow_back">
              {next.daf}
            </Button>
          )}
          <HelpButton onClick={() => setHelpOpen(true)} />
          {holder && (
            <Button variant="outlined" size="sm" icon="lock_open" onClick={release} loading={busy}>
              שחרור העמוד
            </Button>
          )}
        </div>
      </div>

      {!holder && (
        <div role="note" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-alt-200 bg-warning-alt-50 p-3 text-warning-alt-800">
          <span aria-hidden="true" className="material-symbols-outlined">visibility</span>
          <span className="flex-1">
            {page.state === 'open' ? 'העמוד אינו בידיכם — אפשר להסתכל, וכדי לבדוק אותו צריך לקחת אותו.' : 'צפייה בלבד: העמוד אינו בידיכם, והשינויים כאן לא נשמרים.'}
          </span>
          {page.state === 'open' && (
            <Button size="sm" icon="lock_open" onClick={claim} loading={busy}>
              קח את העמוד
            </Button>
          )}
        </div>
      )}

      <ReviewStageBar stage={stage} onStage={(s) => STAGE_KEYS.includes(s) && setStage(s)} status={holder ? draftSaver.status : null} />

      {stage === 'overview' && (
        <OverviewStage
          page={page}
          checks={work.checks}
          readOnly={!holder}
          onCheck={(key, v) => patch({ checks: { ...work.checks, [key]: v } })}
          onIssue={(category) => setReportEdit({ index: null, initial: { category } })}
        />
      )}
      {stage === 'lines' && (
        <LinesStage
          scanUrl={page.scan?.url}
          pageId={page.id}
          model={page.model}
          ops={hist.present}
          onOps={(ops) => setHist((h) => pushHistory(h, ops))}
          onUndo={() => setHist(undoHistory)}
          onRedo={() => setHist(redoHistory)}
          canUndo={hist.past.length > 0}
          canRedo={hist.future.length > 0}
          onRejected={toast}
          readOnly={!holder}
          nonVilna={!!page.nonVilna}
        />
      )}
      {stage === 'text' && (
        <TextStage
          pageId={page.id}
          items={items}
          answers={work.itemAnswers}
          onAnswer={(id, v) => {
            const itemAnswers = { ...work.itemAnswers }
            if (v) itemAnswers[id] = v
            else delete itemAnswers[id]
            patch({ itemAnswers })
          }}
          manualItems={work.manualItems}
          onAddManual={(m) => patch({ manualItems: [...work.manualItems, m] })}
          onRemoveManual={(i) => patch({ manualItems: work.manualItems.filter((_, j) => j !== i) })}
          model={shownModel}
          scan={page.scan}
          readOnly={!holder}
        />
      )}
      {stage === 'submit' && (
        <SubmitStage
          reports={work.reports}
          onAddReport={() => setReportEdit({ index: null, initial: null })}
          onEditReport={(i) => setReportEdit({ index: i, initial: work.reports[i] })}
          onDeleteReport={(i) => patch({ reports: work.reports.filter((_, j) => j !== i) })}
          summary={summary}
          missing={missing}
          note={work.note}
          onNote={(note) => patch({ note })}
          onSubmit={submit}
          submitting={submitting}
          readOnly={!holder}
          onGoOverview={() => setStage('overview')}
        />
      )}

      {stage !== 'submit' && (
        <div className="flex justify-end">
          <Button variant="tonal" iconEnd="arrow_back" onClick={() => setStage(STAGE_KEYS[STAGE_KEYS.indexOf(stage) + 1])}>
            לשלב הבא
          </Button>
        </div>
      )}

      {reportEdit && <ReportDialog initial={reportEdit.initial} scan={page.scan} ours={page.ours} onSave={saveReport} onClose={() => setReportEdit(null)} />}
      <HelpDialog track="review" open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
