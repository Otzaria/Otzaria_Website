'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

// Recharts נטען רק כשיש מה להציג — כך הוא אינו חלק מה-bundle ההתחלתי של הדף
// (כ-96KB gzip) ואינו מתחרה על הרשת עם התוכן המרכזי.
const WeeklyProgressArea = dynamic(() => import('./WeeklyProgressArea'), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
})

export default function WeeklyProgressChart() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/stats/weekly-progress')
        const json = await res.json()
        if (json.success) {
          setData(json.data)
          setTotal(json.total)
        }
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 h-40 flex items-center justify-center shadow-sm">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary/50">
          progress_activity
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm h-full flex flex-col justify-between">
      {/* כותרת ונתון מספרי */}
      <div className="flex justify-between items-start mb-2">
        <div>
            <h2 className="text-base font-bold text-neutral-800 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-lg">bar_chart</span>
                הספק שבועי
            </h2>
            <p className="text-[11px] text-neutral-500">דפים שהושלמו ב-7 ימים</p>
        </div>
        <div className="text-left">
            <span className="text-2xl font-bold text-primary block leading-none">{total}</span>
        </div>
      </div>

      {/* איזור הגרף - גובה מוגדר חובה! */}
      <div className="h-[120px] w-full mt-1" dir="ltr">
        <WeeklyProgressArea data={data} />
      </div>
    </div>
  )
}
