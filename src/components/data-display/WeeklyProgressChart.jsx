'use client'

import { useState, useEffect } from 'react'
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts'

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
      <div className="bg-white rounded-xl border border-gray-200 h-40 flex items-center justify-center shadow-sm">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary/50">
          progress_activity
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-full flex flex-col justify-between">
      {/* כותרת ונתון מספרי */}
      <div className="flex justify-between items-start mb-2">
        <div>
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-lg">bar_chart</span>
                הספק שבועי
            </h2>
            <p className="text-[11px] text-gray-500">דפים שהושלמו ב-7 ימים</p>
        </div>
        <div className="text-left">
            <span className="text-2xl font-bold text-primary block leading-none">{total}</span>
        </div>
      </div>
      
      {/* איזור הגרף - גובה מוגדר חובה! */}
      <div className="h-[120px] w-full mt-1" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6b5d4f" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#6b5d4f" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#888', fontSize: 10 }}
              interval={0} // הצג את כל הימים
              dy={5}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#888', fontSize: 10 }}
              allowDecimals={false}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                border: '1px solid #eee',
                borderRadius: '6px',
                fontSize: '12px',
                padding: '4px 8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
              }}
              itemStyle={{ color: '#6b5d4f', fontWeight: 'bold' }}
              labelStyle={{ display: 'none' }} // הסתרת כותרת ה-Tooltip למראה נקי
              formatter={(value) => [`${value} דפים`]}
            />
            <Area 
              type="monotone" 
              dataKey="count" 
              stroke="#6b5d4f" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorCount)" 
              activeDot={{ r: 4, strokeWidth: 0, fill: '#6b5d4f' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}