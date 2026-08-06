'use client'
import { useState, useEffect, useRef } from 'react'

/**
 * מספר שמטפס מ-0 לערכו כשהוא נכנס למסך.
 *
 * היה בנוי על useSpring/useTransform של framer-motion. כאן זה requestAnimationFrame
 * ו-IntersectionObserver: אותו אפקט בלי לגרור את framer-motion לדף הספרייה
 * (כ-114KB raw), שהוא הצרכן היחיד שלו שנשאר שם.
 */
const COUNTER_DURATION_MS = 1400

function Counter({ value }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // כיבוד העדפת המשתמש: בלי אנימציה, פשוט הערך הסופי
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = value.toLocaleString()
      return
    }

    let frame
    const animate = () => {
      const start = performance.now()
      const step = (t) => {
        const progress = Math.min(1, (t - start) / COUNTER_DURATION_MS)
        // easeOutCubic — התחלה מהירה והאטה לקראת הסוף, כמו ה-spring הקודם.
        // כתיבה ישירה ל-DOM ולא דרך state, כדי לא לרנדר מחדש בכל frame.
        const eased = 1 - Math.pow(1 - progress, 3)
        node.textContent = Math.round(value * eased).toLocaleString()
        if (progress < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        observer.disconnect()
        animate()
      },
      { rootMargin: '-50px' }
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [value])

  return <span ref={ref}>0</span>
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
            <div
              key={i}
              // שימוש ב-glass effect ובצבעי ה-surface שהגדרת.
              // ריחוף ב-CSS: הרמה, מסגרת ב-primary וצל — היה whileHover של framer.
              className="flex flex-col items-center p-8 rounded-xl border border-surface-variant glass-strong shadow-sm cursor-default transition-all duration-300 hover:-translate-y-2.5 hover:border-primary hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]"
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
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
