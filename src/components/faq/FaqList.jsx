'use client'

import { useEffect, useRef, useState } from 'react'
import FaqCategoryFilter from './FaqCategoryFilter'
import FaqCategorySection from './FaqCategorySection'
import { ALL_CATEGORY, faqAnchorId, findFaqByHash, groupFaqs } from './faqContent'

/**
 * החלק האינטראקטיבי של דף השאלות: סינון לפי קטגוריה, והשאלות מקובצות לפי קטגוריה.
 * הפתיחה והסגירה של כל שאלה — details/summary בדפדפן, בלי state (כמה שאלות יכולות להיות פתוחות).
 * עוגן בכתובת (/faq#faq-7, גם בשינוי hash בלי טעינה): מחזיר ל"הכל" אם השאלה מסוננת החוצה,
 * פותח אותה וגולל אליה.
 */
export default function FaqList({ categories, faqs }) {
  const [active, setActive] = useState(ALL_CATEGORY)
  // השאלה שהעוגן ביקש ועוד לא נפתחה. ב-ref ולא ב-state: אחרי הפתיחה מתאפס, כדי ששינוי סינון
  // מאוחר יותר לא יפתח ויגלול אליה שוב. hashTick — מעורר את הפתיחה גם כשהסינון לא השתנה.
  const pendingRef = useRef(null)
  const [hashTick, setHashTick] = useState(0)

  useEffect(() => {
    const onHash = () => {
      const faq = findFaqByHash(window.location.hash, faqs)
      if (!faq) return
      pendingRef.current = faq.id
      setActive((current) => (current === ALL_CATEGORY || current === faq.category ? current : ALL_CATEGORY))
      setHashTick((tick) => tick + 1)
    }
    // קישור אל העוגן שכבר בכתובת לא מפעיל hashchange — פותחים בכל זאת
    const onClick = (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href*="#faq-"]') : null
      if (link && link.hash === window.location.hash && link.pathname === window.location.pathname) onHash()
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('hashchange', onHash)
      document.removeEventListener('click', onClick)
    }
  }, [faqs])

  // אחרי שהשאלה ברשימה (ייתכן שרק עכשיו, אחרי החזרה ל"הכל") — פתיחה וגלילה, פעם אחת
  useEffect(() => {
    if (pendingRef.current == null) return
    const el = document.getElementById(faqAnchorId(pendingRef.current))
    if (!el) return
    pendingRef.current = null
    el.open = true
    el.scrollIntoView?.({ block: 'start' })
  }, [hashTick, active])

  const groups = groupFaqs(faqs, categories, active)

  return (
    <>
      <FaqCategoryFilter categories={categories} active={active} onChange={setActive} />
      <div className="mt-8 flex flex-col gap-8 md:mt-10 md:gap-10">
        {groups.map((group) => (
          <FaqCategorySection key={group.category.id} category={group.category} items={group.items} />
        ))}
      </div>
    </>
  )
}
