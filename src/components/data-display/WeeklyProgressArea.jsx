'use client'

/**
 * הגרף עצמו — מופרד מ-WeeklyProgressChart כדי שהייבוא של Recharts (כ-338KB raw /
 * 96KB gzip) לא ייכנס ל-bundle ההתחלתי של הדף. הקומפוננטה נטענת דינמית רק אחרי
 * שהנתונים חזרו, כלומר אחרי שהקטלוג כבר צויר.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

export default function WeeklyProgressArea({ data }) {
  return (
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
  )
}
