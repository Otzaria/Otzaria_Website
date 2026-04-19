'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, useInView, useSpring, useTransform } from 'framer-motion'

function Counter({ value }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-50px" })
  
  const spring = useSpring(0, { mass: 3, stiffness: 20, damping: 35 })
  const display = useTransform(spring, (current) => 
    Math.round(current).toLocaleString()
  )

  useEffect(() => {
    if (inView) spring.set(value)
  }, [inView, value, spring])

  return <motion.span ref={ref}>{display}</motion.span>
}

export default function StatsSection() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        if (data.success) setStats(data.stats)
      })
      .catch(err => console.error(err))
  }, [])

  if (!stats) return null

  const items = [
    { label: 'משתמשים רשומים', value: stats.users?.total || 0, icon: 'group' },
    { label: 'ספרים הועלו', value: stats.books?.total || 0, icon: 'menu_book' },
    { label: 'עמודים הושלמו', value: stats.totalPages || 0, icon: 'description' },
    ...(stats.dictaBooks?.completed >= 1 ? [{ label: 'ספרי דיקטה נערכו', value: stats.dictaBooks?.completed || 0, icon: 'auto_stories' }] : []),
  ]

  return (
    <section className="py-16 bg-transparent">
      <div className={`mx-auto px-4 ${items.length === 4 ? 'max-w-[1400px]' : 'max-w-7xl'}`}>
        <div className={`grid grid-cols-1 ${items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-8`}>
          {items.map((item, i) => (
            <motion.div 
              key={i} 
              // שימוש ב-glass effect ובצבעי ה-surface שהגדרת
              className="flex flex-col items-center p-8 rounded-xl border border-surface-variant glass-strong shadow-sm cursor-default"
              
              whileHover={{ 
                y: -10,
                // שימוש בצבע ה-primary עבור המסגרת במעבר עכבר
                borderColor: "var(--color-primary)",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)"
              }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              {/* האייקון בצבע primary מהתימה */}
              <span className="material-symbols-outlined text-4xl mb-4 text-primary">
                {item.icon}
              </span>
              
              {/* המספר בפונט הפרנק שהגדרת */}
              <div className="text-4xl font-bold text-on-background mb-2 font-frank">
                <Counter value={item.value} />
              </div>
              
              {/* התווית בצבע secondary העדין יותר */}
              <div className="text-secondary font-medium">
                {item.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}