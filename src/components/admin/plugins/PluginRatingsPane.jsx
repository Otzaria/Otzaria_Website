'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Ltr from '@/components/ui/Ltr'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import LoadError from '@/components/admin/list/LoadError'
import { errorToast } from '@/components/admin/list/adminRequest'
import RelativeTime from '@/components/ui/RelativeTime'
import { formatNumber } from '@/lib/adminTerms'
import { ratingAverage, ratingHiddenMessage } from '@/lib/adminPlugins/pluginTerms'
import { loadRatings, setRatingHidden } from './pluginsApi'

function Stars({ value }) {
  return (
    <span role="img" className="inline-flex items-center text-rating" aria-label={`${value} מתוך 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <AppIcon key={i} name="star" className={cx('text-icon-sm', i >= value && 'opacity-30')} />
      ))}
    </span>
  )
}

/**
 * לשונית "דירוגים" (היה חלון נפרד): הממוצע, וכל הדירוגים. "הסתר" — הדירוג נשאר, אבל לא נספר בממוצע
 * ובסדר בחנות; "הצג" מחזיר, ולכן בלי שאלה — הודעה עם "בטל". onAggregate — הממוצע החדש, לשורה ברשימה.
 * @param {{ plugin: any, toast: any, onAggregate: (aggregate: any) => void }} props
 */
export default function PluginRatingsPane({ plugin, toast, onAggregate }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [working, setWorking] = useState(null)
  // "בטל" בהודעה קורא שוב ל-toggle (ההפך) — דרך ref, כי ההודעה נוצרת בתוכו
  const toggleRef = useRef(null)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      setState({ status: 'ready', data: await loadRatings(plugin._id), error: null })
    } catch (error) {
      setState({ status: 'error', data: null, error })
    }
  }, [plugin._id])

  useEffect(() => {
    // טעינה בפתיחת הלשונית; ה-setState אחרי await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const toggle = useCallback(async (rating, { isUndo = false } = {}) => {
    const action = rating.isHidden ? 'unhide' : 'hide'
    setWorking(rating.id)
    try {
      const result = await setRatingHidden(plugin._id, rating.id, action)
      setState((s) => s.data ? {
        ...s,
        data: {
          ...s.data,
          plugin: { ...s.data.plugin, ...result.aggregate },
          ratings: s.data.ratings.map((r) => (r.id === rating.id ? { ...r, ...result.rating } : r)),
        },
      } : s)
      if (result.aggregate) onAggregate(result.aggregate)
      if (!isUndo) {
        const updated = { ...rating, ...result.rating }
        toast.show(action === 'hide'
          ? { message: ratingHiddenMessage(rating), action: { label: 'בטל', undo: true, onClick: () => toggleRef.current?.(updated, { isUndo: true }) } }
          : { message: 'הדירוג חזר להיספר בממוצע' })
      }
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לעדכן את הדירוג.'))
    } finally {
      setWorking(null)
    }
  }, [plugin._id, toast, onAggregate])
  useEffect(() => { toggleRef.current = toggle }, [toggle])

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p role="status" className="sr-only">טוען את הדירוגים…</p>
        <Skeleton className="h-16 w-full" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    )
  }
  if (state.status === 'error') {
    return <LoadError error={state.error} title="לא הצלחנו לטעון את הדירוגים" onRetry={load} />
  }

  const { plugin: agg, ratings } = state.data
  if (ratings.length === 0) return <EmptyState tone="plain" icon="star" title="אין דירוגים עדיין" as="h3" />
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2 rounded-(--radius-control) bg-surface p-3 text-center">
        <div><dt className="text-label-md text-on-surface-variant">ממוצע</dt><dd className="text-title-md tabular-nums text-on-surface">{agg.ratingCount ? ratingAverage(agg.ratingAvg) : '—'}</dd></div>
        <div><dt className="text-label-md text-on-surface-variant">מדרגים</dt><dd className="text-title-md tabular-nums text-on-surface">{formatNumber(agg.ratingCount || 0)}</dd></div>
        <div><dt className="text-label-md text-on-surface-variant">שהתקינו</dt><dd className="text-title-md tabular-nums text-on-surface">{formatNumber(agg.ratingVerifiedCount || 0)}</dd></div>
      </dl>
      <p className="text-body-sm text-on-surface-variant">דירוג מוסתר לא נספר בממוצע ובסדר בחנות, ואפשר להציג אותו שוב בכל רגע.</p>

      <ul className="flex flex-col divide-y divide-outline-variant/60 rounded-(--radius-control) bg-surface">
        {ratings.map((rating) => (
          <li key={rating.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5', rating.isHidden && 'bg-surface-container')}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-body-md text-on-surface">
                <Stars value={rating.value} />
                <bdi className="truncate">{rating.userName}</bdi>
                {rating.verifiedInstall && <Badge tone="success" icon="verified">התקין</Badge>}
                {rating.isHidden && <Badge icon="visibility_off">מוסתר</Badge>}
              </p>
              <p className="text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">
                <RelativeTime date={rating.updatedAt || rating.createdAt} />
                {rating.pluginVersion && <> · גרסה <Ltr>{rating.pluginVersion}</Ltr></>}
                {rating.userEmail && <> · <bdi dir="ltr" className="[overflow-wrap:anywhere]">{rating.userEmail}</bdi></>}
                {rating.isHidden && rating.hiddenByName && <> · הוסתר על ידי <bdi>{rating.hiddenByName}</bdi></>}
              </p>
            </div>
            <Button
              variant="text"
              size="sm"
              icon={rating.isHidden ? 'visibility' : 'visibility_off'}
              loading={working === rating.id}
              disabled={working !== null && working !== rating.id}
              onClick={() => toggle(rating)}
              aria-label={`${rating.isHidden ? 'הצג' : 'הסתר'} את הדירוג של ${rating.userName}`}
            >
              {rating.isHidden ? 'הצג' : 'הסתר'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
