'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import { hasBookLibraryAccess } from '@/lib/roles'
import { rotatedSize, remapPointBetweenRotations } from '@/lib/ocr/geometry'

const MIN_BOX = 6 // גודל מינימלי בפיקסלים מוצגים כדי להיחשב סימון

export default function OcrTrainingEditor() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id
  const { showAlert, showConfirm } = useDialog()

  const [page, setPage] = useState(null)
  const [lines, setLines] = useState([])
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saveState, setSaveState] = useState('saved') // saved | saving | dirty
  const [zoom, setZoom] = useState(1)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  const [draft, setDraft] = useState(null) // ציור נוכחי (פיקסלים מוצגים)
  const [natDims, setNatDims] = useState({ w: 0, h: 0 })

  const drawingRef = useRef(false)
  const startRef = useRef(null)
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const saveTimer = useRef(null)
  const pendingRef = useRef(null) // { lines, rotation } הממתין לשמירה (עבור flush)
  const saveChainRef = useRef(Promise.resolve(true)) // מסרֵל שמירות למניעת מרוץ

  // מידות התמונה המקוריות (עדיפות למדידת השרת, אחרת ה-natural בפועל)
  const imgW = (page?.imageWidth || natDims.w) || 0
  const imgH = (page?.imageHeight || natDims.h) || 0
  // מידות ה"בד" לאחר הסיבוב — התיבות חיות במרחב הזה
  const { w: rw, h: rh } = rotatedSize(imgW, imgH, rotation)

  const canEdit = page && (page.mine || hasBookLibraryAccess(session?.user?.role))
  const isRashi = page?.scriptType === 'rashi'

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/ocr-training/${id}`)
      const data = await res.json()
      if (data.success) {
        setPage(data.page)
        setLines(data.page.lines || [])
        setRotation(data.page.rotation || 0)
      } else {
        setError(data.error || 'שגיאה בטעינה')
      }
    } catch {
      setError('תקלה בתקשורת')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=/library/ocr-training/${id}`)
    } else if (status === 'authenticated') {
      load()
    }
  }, [status, id, load, router])

  // ציור העמוד לקנבס (מסובב וממורכז) — זהה לחיתוך בייצוא (sharp.rotate).
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgW || !imgH) return
    const { w, h } = rotatedSize(imgW, imgH, rotation)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH)
    ctx.restore()
  }, [imgW, imgH, rotation])

  useEffect(() => {
    draw()
  }, [draw, imgLoaded])

  // ===== שמירה =====
  // שמירה מסורֵלת (single-flight): כל קריאה משורשרת לקודמתה, כך שאין שתי שמירות
  // במקביל ואין מרוץ. מנקים את ה-pending רק אם לא הוחלף מאז שהתחלנו — כדי לא
  // לאבד עריכה שנכנסה בזמן השמירה.
  const saveNow = useCallback(() => {
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (!canEdit) return true
      const payload = pendingRef.current
      if (!payload) return true
      setSaveState('saving')
      try {
        const res = await fetch(`/api/ocr-training/${id}/lines`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (data.success) {
          if (pendingRef.current === payload) {
            pendingRef.current = null // רק אם לא נכנסה עריכה חדשה בינתיים
            setSaveState('saved')
          } else {
            setSaveState('dirty') // יש pending חדש — יישמר בסבב הבא
          }
          return true
        }
        setSaveState('dirty')
        return false
      } catch {
        setSaveState('dirty')
        return false
      }
    })
    return saveChainRef.current
  }, [id, canEdit])

  const persist = useCallback(
    (nextLines, nextRotation) => {
      if (!canEdit) return
      setSaveState('dirty')
      pendingRef.current = { lines: nextLines, rotation: nextRotation }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        saveNow()
      }, 700)
    },
    [canEdit, saveNow]
  )

  // מוודא שכל עריכה ממתינה נשמרה, וממתין לסיום השרשרת. מחזיר false אם נותר pending
  // (למשל שמירה שנכשלה) — נקרא לפני "סיים"/"שחרר".
  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await saveNow()
    return !pendingRef.current
  }, [saveNow])

  const updateLines = useCallback(
    (next) => {
      setLines(next)
      persist(next, rotation)
    },
    [persist, rotation]
  )

  // שינוי זווית — מותר בכל עת. אם כבר יש שורות, ממפים אותן למרחב הזווית החדשה
  // כך שהסימון נשאר על אותה שורה בתוכן (ולא זז ביחס לתמונה).
  const onRotationChange = (val) => {
    const r = Math.round((Math.max(-20, Math.min(20, Number(val) || 0)) * 10)) / 10
    if (Math.abs(r - rotation) < 1e-9) return
    if (lines.length && imgW && imgH) {
      const remapped = lines.map((l) => {
        const c = remapPointBetweenRotations(l.x + l.width / 2, l.y + l.height / 2, imgW, imgH, rotation, r)
        return { ...l, x: Math.round(c.x - l.width / 2), y: Math.round(c.y - l.height / 2) }
      })
      setLines(remapped)
      setRotation(r)
      persist(remapped, r)
    } else {
      setRotation(r)
      persist(lines, r)
    }
  }

  const nudgeRotation = (delta) => onRotationChange(Math.round((rotation + delta) * 10) / 10)

  // ===== המרת קואורדינטות =====
  const relPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    }
  }

  const toRaster = () => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { sx: rw / rect.width, sy: rh / rect.height }
  }

  const onPointerDown = (e) => {
    if (!canEdit) return
    if (e.target.dataset.box) return
    e.preventDefault()
    drawingRef.current = true
    startRef.current = relPoint(e)
    setSelected(null)
    setDraft({ ...startRef.current, w: 0, h: 0 })
  }

  const onPointerMove = (e) => {
    if (!drawingRef.current) return
    const p = relPoint(e)
    const s = startRef.current
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    })
  }

  const onPointerUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const d = draft
    setDraft(null)
    if (!d || d.w < MIN_BOX || d.h < MIN_BOX) return
    if (lines.length >= (page?.targetLines || 10)) {
      showAlert('הגעת ליעד', `יש לסמן בדיוק ${page?.targetLines || 10} שורות. מחקו שורה כדי לסמן אחרת.`)
      return
    }
    const { sx, sy } = toRaster()
    const newLine = {
      x: Math.round(d.x * sx),
      y: Math.round(d.y * sy),
      width: Math.round(d.w * sx),
      height: Math.round(d.h * sy),
      text: '',
    }
    const next = [...lines, newLine]
    updateLines(next)
    setSelected(next.length - 1)
    setTimeout(() => {
      const el = document.getElementById(`line-input-${next.length - 1}`)
      if (el) {
        el.focus()
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }, 50)
  }

  const setLineText = (i, text) => {
    updateLines(lines.map((l, idx) => (idx === i ? { ...l, text } : l)))
  }

  const deleteLine = (i) => {
    updateLines(lines.filter((_, idx) => idx !== i))
    setSelected(null)
  }

  const handleComplete = async () => {
    const target = page.targetLines || 10
    const filled = lines.filter((l) => l.text && l.text.trim()).length
    if (lines.length !== target || filled !== target) {
      return showAlert('עדיין לא', `נדרשות בדיוק ${target} שורות מסומנות עם טקסט (מסומנות ${lines.length}, עם טקסט ${filled}).`)
    }
    showConfirm('סיום עמוד', `לסמן את העמוד כהושלם? (${target} שורות)`, async () => {
      try {
        const saved = await flushSave()
        if (!saved) return showAlert('שגיאה', 'שמירת השורות נכשלה — בדקו את החיבור ונסו שוב לפני הסיום.')
        const res = await fetch(`/api/ocr-training/${id}/complete`, { method: 'POST' })
        const data = await res.json()
        if (data.success) {
          showAlert('הצלחה', 'העמוד סומן כהושלם. תודה!')
          router.push('/library/ocr-training')
        } else {
          showAlert('שגיאה', data.error || 'שגיאה')
        }
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  const handleRelease = async () => {
    showConfirm('שחרור עמוד', 'לשחרר את העמוד? השורות שסימנת יישמרו אך העמוד יחזור להיות זמין לאחרים.', async () => {
      try {
        const saved = await flushSave()
        if (!saved) return showAlert('שגיאה', 'שמירת השורות נכשלה — בדקו את החיבור ונסו שוב לפני השחרור.')
        await fetch(`/api/ocr-training/${id}/release`, { method: 'POST' })
        router.push('/library/ocr-training')
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  if (status === 'loading' || loading)
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <div className="text-center p-20 text-on-surface/60">טוען...</div>
      </div>
    )

  if (error)
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <div className="text-center p-20 text-danger-500">{error}</div>
      </div>
    )

  const filled = lines.filter((l) => l.text && l.text.trim()).length
  const pct = (v, total) => (total ? (v / total) * 100 : 0)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      {/* img נסתר לטעינת המקור עבור הקנבס */}
      <img
        ref={imgRef}
        src={page.imagePath}
        alt=""
        style={{ display: 'none' }}
        onLoad={(e) => {
          const im = e.currentTarget
          if (im.naturalWidth) setNatDims({ w: im.naturalWidth, h: im.naturalHeight })
          setImgLoaded(true)
        }}
      />
      <main className="flex-1 w-full px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {/* סרגל עליון */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-accent">model_training</span>
                {page.bookName} — עמוד {page.pageNumber}
              </h1>
              <p className="text-sm text-on-surface/60">
                שורות עם טקסט:{' '}
                <span className={filled >= page.targetLines ? 'text-success-600 font-bold' : 'text-info-600 font-bold'}>
                  {filled}/{page.targetLines}
                </span>
                {' · '}
                {saveState === 'saving' ? 'שומר…' : saveState === 'dirty' ? 'ממתין לשמירה…' : 'נשמר'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { await flushSave(); router.push('/library/ocr-training'); }} className="glass px-4 py-2 rounded-lg hover:bg-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                חזרה
              </button>
              {canEdit && page.mine && (
                <button onClick={handleRelease} className="bg-warning-strong-100 text-warning-strong-700 px-4 py-2 rounded-lg hover:bg-warning-strong-200 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">lock_open</span>
                  שחרר
                </button>
              )}
              {canEdit && (
                <button onClick={handleComplete} className="bg-success-600 text-white px-4 py-2 rounded-lg hover:bg-success-700 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  סיים
                </button>
              )}
            </div>
          </div>

          {/* באנר סוג כתב + הבהרה לגבי עמוד מעורב */}
          <div
            className={`mb-4 rounded-lg p-3 text-sm border flex items-start gap-2 ${
              isRashi
                ? 'bg-warning-alt-50 border-warning-alt-200 text-warning-alt-800'
                : 'bg-info-50 border-info-200 text-info-800'
            }`}
          >
            <span className="material-symbols-outlined text-base">{isRashi ? 'history_edu' : 'text_fields'}</span>
            <div>
              <b>כתב העמוד: {isRashi ? 'רש״י' : 'מרובע (רגיל)'}</b>
              <div className="opacity-90">
                סמנו <b>רק</b> שורות בכתב {isRashi ? 'רש״י' : 'מרובע'}. אם בעמוד יש כמה סוגי כתב (למשל פנים ומפרש) —
                דלגו על שורות שאינן בכתב {isRashi ? 'רש״י' : 'מרובע'} ואל תסמנו אותן.
              </div>
            </div>
          </div>

          {!canEdit && (
            <div className="mb-4 bg-info-50 border border-info-200 text-info-800 rounded-lg p-3 text-sm">
              עמוד זה תפוס על ידי {page.claimedByName || 'משתמש אחר'}. הצפייה בלבד.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* תמונה + סימון */}
            <div className="lg:col-span-2">
              <div className="glass-strong rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="glass p-1.5 rounded-lg" title="הקטן">
                    <span className="material-symbols-outlined text-sm">zoom_out</span>
                  </button>
                  <span className="text-sm text-on-surface/60 w-12 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="glass p-1.5 rounded-lg" title="הגדל">
                    <span className="material-symbols-outlined text-sm">zoom_in</span>
                  </button>

                  {/* סיבוב עדין ליישור — כמו בעריכה הרגילה (צעדי 0.1°) */}
                  <div className="flex items-center gap-1 mr-2 pr-2 border-r border-neutral-200" title="סיבוב עדין ליישור העמוד">
                    <span className="material-symbols-outlined text-sm text-on-surface/60">screen_rotation</span>
                    <button onClick={() => nudgeRotation(-0.1)} disabled={!canEdit} className="glass px-1.5 py-0.5 rounded disabled:opacity-40" title="סובב שמאלה 0.1°">‹</button>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.1"
                      value={rotation}
                      disabled={!canEdit}
                      onChange={(e) => onRotationChange(e.target.value)}
                      className="w-24 disabled:opacity-40 align-middle"
                    />
                    <button onClick={() => nudgeRotation(0.1)} disabled={!canEdit} className="glass px-1.5 py-0.5 rounded disabled:opacity-40" title="סובב ימינה 0.1°">›</button>
                    <span className="text-xs text-on-surface/60 w-12 text-center">{rotation.toFixed(1)}°</span>
                    {canEdit && rotation !== 0 && (
                      <button onClick={() => onRotationChange(0)} className="glass p-1 rounded" title="אפס סיבוב">
                        <span className="material-symbols-outlined text-sm">restart_alt</span>
                      </button>
                    )}
                  </div>

                  {canEdit && <span className="text-xs text-on-surface/50 mr-auto">גררו על התמונה כדי לסמן שורה</span>}
                </div>

                <div className="overflow-auto border border-neutral-200 rounded-lg bg-neutral-100" style={{ maxHeight: '75vh' }}>
                  <div className="inline-block" style={{ width: `${zoom * 100}%` }}>
                    <div className="relative">
                      <canvas ref={canvasRef} className="block w-full" />
                      {/* שכבת סימון */}
                      <div
                        className="absolute inset-0"
                        style={{ cursor: canEdit ? 'crosshair' : 'default', touchAction: 'none' }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                      >
                        {lines.map((l, i) => (
                          <div
                            key={i}
                            data-box="1"
                            onClick={() => {
                              setSelected(i)
                              const el = document.getElementById(`line-input-${i}`)
                              if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
                            }}
                            className={`absolute border-2 ${
                              selected === i
                                ? 'border-accent bg-accent/20'
                                : l.text?.trim()
                                ? 'border-success-500 bg-success-500/10'
                                : 'border-danger-500 bg-danger-500/10'
                            }`}
                            style={{
                              left: `${pct(l.x, rw)}%`,
                              top: `${pct(l.y, rh)}%`,
                              width: `${pct(l.width, rw)}%`,
                              height: `${pct(l.height, rh)}%`,
                              cursor: 'pointer',
                            }}
                            title={l.text || `שורה ${i + 1}`}
                          >
                            <span data-box="1" className="absolute -top-3 -right-2 bg-black/70 text-white text-[10px] px-1 rounded pointer-events-none">
                              {i + 1}
                            </span>
                          </div>
                        ))}
                        {draft && (
                          <div
                            className="absolute border-2 border-accent bg-accent/20 pointer-events-none"
                            style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* פאנל שורות + טקסט שמור */}
            <div className="lg:col-span-1 space-y-4">
              {/* טקסט שמור במערכת */}
              <div className="glass-strong rounded-xl p-3">
                <button
                  onClick={() => setShowSaved((v) => !v)}
                  className="w-full flex items-center justify-between font-bold text-on-surface"
                >
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">description</span>
                    טקסט שמור במערכת
                  </span>
                  <span className="material-symbols-outlined text-sm">{showSaved ? 'expand_less' : 'expand_more'}</span>
                </button>
                {showSaved && (
                  <div className="mt-2">
                    {page.savedText ? (
                      <pre dir="rtl" className="whitespace-pre-wrap text-sm text-on-surface/80 font-frank max-h-64 overflow-y-auto bg-surface/50 rounded-lg p-2 border border-neutral-200">
                        {page.savedText}
                      </pre>
                    ) : (
                      <p className="text-sm text-on-surface/50 py-2">אין טקסט שמור לעמוד זה במערכת.</p>
                    )}
                    <p className="text-xs text-on-surface/40 mt-1">לעזרה בלבד — יש להקליד את הטקסט המדויק של כל שורה כפי שהיא בתמונה.</p>
                  </div>
                )}
              </div>

              <div className="glass-strong rounded-xl p-3 sticky top-4">
                <h3 className="font-bold text-on-surface mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">list</span>
                  שורות ({lines.length}/{page.targetLines})
                </h3>
                {lines.length === 0 && (
                  <p className="text-sm text-on-surface/50 py-4 text-center">
                    {canEdit ? 'סמנו שורה על התמונה כדי להתחיל.' : 'לא סומנו שורות.'}
                  </p>
                )}
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {lines.map((l, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 p-2 rounded-lg border ${
                        selected === i ? 'border-accent bg-accent/5' : 'border-neutral-200'
                      }`}
                      onClick={() => setSelected(i)}
                    >
                      <span className="text-xs font-bold text-on-surface/50 mt-2 w-5 text-center shrink-0">{i + 1}</span>
                      <input
                        id={`line-input-${i}`}
                        dir="rtl"
                        value={l.text}
                        onChange={(e) => setLineText(i, e.target.value)}
                        onFocus={() => setSelected(i)}
                        disabled={!canEdit}
                        placeholder="טקסט השורה…"
                        className="flex-1 border border-neutral-200 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-accent outline-none disabled:bg-neutral-50 font-frank"
                      />
                      {canEdit && (
                        <button onClick={() => deleteLine(i)} className="text-danger-500 hover:bg-danger-50 p-1 rounded shrink-0" title="מחק שורה">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
