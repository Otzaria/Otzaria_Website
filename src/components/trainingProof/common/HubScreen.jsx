'use client'

import { useCallback, useEffect, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { canProof } from '@/lib/trainingProof/accessRules'
import { tpFetch } from './tpApi'
import NoAccess from './NoAccess'
import HubTiles from './HubTiles'
import MyStats from './MyStats'

// דף הבית של "הגהה לאימון המודלים": בלי גישה — רק ההודעה ו"בקשת גישה" (ה-1);
// עם גישה — שלושת החלקים ו"ההגהות שלי" לפי סוג (ה-2, ה-3).
export default function HubScreen() {
  const [state, setState] = useState({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    tpFetch('/api/training-proof').then((r) => {
      if (!cancelled) setState(r.ok ? { status: 'ready', ...r.data } : { status: 'error', error: r.data.error || 'הטעינה נכשלה' })
    })
    return () => {
      cancelled = true
    }
  }, [nonce])

  const load = useCallback(() => {
    setState({ status: 'loading' })
    setNonce((n) => n + 1)
  }, [])

  if (state.status === 'loading')
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="mx-auto mt-10 flex flex-col items-center gap-3" role="alert">
        <p>{state.error}</p>
        <Button onClick={load}>נסו שוב</Button>
      </div>
    )
  if (!canProof(state.access)) return <NoAccess access={state.access} onRequested={load} />

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-headline-md font-bold text-on-surface">הגהה לאימון המודלים</h1>
        <div className="flex flex-wrap items-center gap-2">
          {state.isAdmin ? (
            <Button href="/library/admin/page-proof" variant="outlined" size="sm" icon="admin_panel_settings">
              ניהול
            </Button>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-lg bg-success-container px-2 py-0.5 text-label-md text-on-success-container">
            <AppIcon name="verified_user" className="text-base" />
            יש לך גישה
          </span>
        </div>
      </div>
      <HubTiles sections={state.sections} />
      <MyStats stats={state.stats} />
    </>
  )
}
