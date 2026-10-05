'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ProofEditor from './ProofEditor'
import InheritedNotice from './InheritedNotice'
import StageBar from './StageBar'
import StagePanel from './StagePanel'
import { useServerDraft } from './useServerDraft'
import { STAGE_TEXT, cutOpsOf, finishStructure, initialStage } from '@/lib/pageProof/stages'

// העורך של דף המתנדב בעריכה (app/library/page-proof): ProofEditor + הטיוטה בשרת (docs/63 §2 — useServerDraft) + שני
// השלבים (docs/63 §3 — lib/pageProof/stages.js).
//   • השלב: נשמר בטיוטה (ולכן עובר מחשב ועובר מתנדב); עמוד חדש ← "מבנה"; טיוטה בעבודה מלפני השלבים, או עמוד שחזר
//     מזיהוי-מחדש ← "טקסט" (stages.initialStage). העורך מקבל focus לפי השלב.
//   • "מבנה" ← "✓ המבנה נכון — להגהת הטקסט" (או "דלג — המבנה נכון"): בלי שינוי-חיתוך — "טקסט" מיד; עם שינוי-חיתוך —
//     הטיוטה נשמרת באתר ותיקוני-החיתוך נשלחים לזיהוי-מחדש (בלי מנהל; העמוד יחזור לאותו מתנדב, לשלב "טקסט"); אי אפשר
//     לשלוח עכשיו (canRecut מהשרת, או שהשליחה נדחתה) — "טקסט" כמו היום, והשורות שנחתכו נעולות עד ההגשה.
//   • "טקסט" ← ההגשה (חלון-ההגשה של הדף); "חזרה לשלב המבנה" — הטקסט שתוקן נשאר.
//   • "במה כבר טיפלתי" (StagePanel) — בקצה הסרגל, ליד הכפתור של השלב.
//   • טיוטה שהתקבלה ממישהו אחר (הבודק השני, עמוד שנפתח מחדש, מתנדב קודם — draft.inherited): ההודעה עם "התחל מאפס",
//     והשינויים מסומנים בעורך (ProofEditor inherited).
// הדף מחליט מה נטען לעורך (drafts.cleanupPageDrafts + draftRules.applyServerDraft) לפני שהוא נפתח.
//
// Props: current — מה שהדף קיבל (GET /api/page-proof/pages/[id]: page, draft, canRecut) + draftKey + draftInfo
// ({source, srv, stage}); help — נוסח העזרה; recutOpen — מתג המנהל (מעודכן בדף); saving — הדף באמצע הגשה/שליחה;
// onSubmit(args) — חלון ההגשה; onSendRecut({ops}) — שליחת תיקוני-החיתוך: Promise של {ok, error} (בהצלחה הדף ממשיך
// לעמוד הבא); onReset() — "התחל מאפס" נשמר באתר: הדף טוען את העמוד מחדש; onReload() — "טען מחדש" כשהשמירה באתר נדחתה
// (הטיוטה נשמרה בינתיים בלשונית/מחשב אחר, או העמוד הוחלף) — בלי למחוק את המקומית.
//
// לפני שליחה לזיהוי-מחדש: goStage('text') מחכה לתור-השמירה (useServerDraft) — הבקשה האחרונה יוצאת עם כל מה שבעורך
// באותו רגע, ורק אחריה נשלחת הבקשה לזיהוי-מחדש.

const hasOps = (info, draft) =>
  info?.source === 'local' || info?.source === 'merged' || (info?.source === 'server' && (draft?.ops?.length || 0) > 0)

export default function StagedEditor({ current, help, recutOpen = true, saving = false, onSubmit, onSendRecut, onReset, onReload }) {
  const page = current.page
  const draft = current.draft || null
  const saved = current.draftInfo?.stage ?? null
  const [stage, setStage] = useState(() => initialStage({ saved, inProgress: hasOps(current.draftInfo, draft), revision: page.revision }))
  const sync = useServerDraft({
    pageId: page.id,
    revision: page.revision,
    draftKey: current.draftKey,
    stage: saved,
    // מה שכבר באתר — כדי לא לשלוח אותו שוב (טיוטה מקומית חדשה יותר ממנה — נשלחת)
    initial: draft ? { ops: draft.ops, srv: draft.updatedAt } : null,
  })
  const [noticeOpen, setNoticeOpen] = useState(true)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  // הרשימה העדכנית מהעורך (onOpsChange) — לכפתורי-השלב
  const opsRef = useRef([])

  // שלב שנקבע עכשיו (עמוד חדש, או טיוטה מלפני השלבים) — נשמר בטיוטה מיד
  const [firstStage] = useState(stage)
  useEffect(() => {
    if (firstStage !== saved) sync.setStage(firstStage)
  }, [firstStage, saved, sync])

  const onOps = useCallback(
    (all) => {
      opsRef.current = Array.isArray(all) ? all : []
      sync.onOps(all)
    },
    [sync]
  )

  const goStage = useCallback(
    (next) => {
      setStage(next)
      return sync.setStage(next)
    },
    [sync]
  )

  // "✓ המבנה נכון — להגהת הטקסט" / "דלג — המבנה נכון"
  const finish = useCallback(async () => {
    const plan = finishStructure({ ops: opsRef.current, canRecut: !!current.canRecut && recutOpen })
    setNote(null)
    if (plan.next !== 'recut') {
      if (plan.locked) setNote(STAGE_TEXT.recutLocked(plan.locked))
      await goStage('text')
      return
    }
    setBusy(true)
    try {
      // קודם הטיוטה כולה באתר, בשלב "טקסט" — כשהעמוד יחזור מהזיהוי-מחדש היא עוברת אליו (serverDrafts)
      if (!(await goStage('text'))) {
        setStage('structure')
        setNote('הטיוטה לא נשמרה באתר, ולכן העמוד לא נשלח לזיהוי-מחדש — בדקו את החיבור ונסו שוב.')
        return
      }
      const r = await onSendRecut?.({ ops: plan.cut })
      if (r?.ok) return
      setNote(`${STAGE_TEXT.recutLocked(plan.cut.length)}${r?.error ? ` (${r.error})` : ''}`)
    } finally {
      setBusy(false)
    }
  }, [current.canRecut, recutOpen, goStage, onSendRecut])

  const back = useCallback(() => {
    setNote(null)
    goStage('structure')
  }, [goStage])

  const reset = useCallback(async () => {
    setBusy(true)
    try {
      if (await sync.reset()) onReset?.()
    } finally {
      setBusy(false)
    }
  }, [sync, onReset])

  const recut = draft?.recut || null
  const working = busy || saving

  return (
    <div className="flex flex-col gap-2">
      {draft?.inherited && noticeOpen && (
        <InheritedNotice inherited={draft.inherited} onReset={onReset ? reset : null} onClose={() => setNoticeOpen(false)} busy={working} />
      )}
      <StageBar
        stage={stage}
        status={sync.status}
        onSkip={finish}
        onBack={back}
        busy={working}
        note={note}
        onCloseNote={() => setNote(null)}
        onReload={onReload || null}
      />
      <ProofEditor
        page={page}
        draftKey={current.draftKey}
        readOnly={false}
        help={help}
        focus={stage}
        inherited={draft?.inherited || null}
        onOpsChange={onOps}
        actions={(args) =>
          stage === 'structure' ? (
            <>
              <StagePanel stage={stage} view={args.view} ops={args.ops} recut={recut} />
              <FinishButton cut={cutOpsOf(args.ops).length > 0 && !!current.canRecut && recutOpen} onClick={finish} disabled={working} />
            </>
          ) : (
            <>
              <StagePanel stage={stage} view={args.view} ops={args.ops} approval={args.approval} recut={recut} />
              <button
                type="button"
                onClick={() => onSubmit?.(args)}
                disabled={working}
                className="flex items-center gap-1 rounded-lg bg-success-600 px-4 py-1.5 font-bold text-white hover:bg-success-700 disabled:opacity-40"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">{saving ? 'hourglass_top' : 'send'}</span>
                הגשת העמוד
              </button>
            </>
          )
        }
      />
    </div>
  )
}

function FinishButton({ cut, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={cut ? STAGE_TEXT.finishRecutTitle : STAGE_TEXT.finishTitle}
      className={`flex items-center gap-1 rounded-lg px-4 py-1.5 font-bold text-white disabled:opacity-40 ${
        cut ? 'bg-feature-600 hover:bg-feature-700' : 'bg-success-600 hover:bg-success-700'
      }`}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-base">{cut ? 'cached' : 'task_alt'}</span>
      {cut ? STAGE_TEXT.finishRecut : STAGE_TEXT.finish}
    </button>
  )
}
