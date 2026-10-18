'use client'

import { lazy, Suspense } from 'react'

/**
 * הכותרת של דף ה-404 הכללי (app/not-found.tsx), בטעינה עצלה.
 *
 * למה: ה-not-found של השורש הוא חלק מעץ ה-layout הראשי, ולכן כל רכיב לקוח שהוא מייבא ישירות
 * נכנס לחבילת הלקוח של *כל* עמוד באתר — גם של דפי /library, שיש להם כותרת משלהם. הכותרת
 * השיווקית (ניווט, תפריט נפתח, תרומה, תפריט נייד) הוסיפה כך כ-11KB gzip לכל דף בספרייה
 * (נמדד ב-check:perf: ‏/library/books ‏225KB ← 213KB).
 *
 * הפיצול חייב לשבת ברכיב לקוח: ב-Server Component טעינה דינמית לא מפצלת קוד (ראו
 * node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md). React.lazy ולא next/dynamic:
 * נמדד כ-1KB gzip פחות בכל עמוד. הכותרת עוברת לצ'אנק נפרד שנטען רק כשדף 404 מוצג בפועל;
 * השרת מרנדר אותה ב-HTML (SSR), כך שהיא על המסך מהציור הראשון, בלי הבהוב ובלי קפיצת פריסה.
 * המחיר: בדפי השיווק, שמייבאים את הכותרת בעצמם, היא כבר לא בצ'אנק המשותף של השורש — כ-3KB
 * gzip יותר בכל אחד מהם (‏/ ‏209KB ← 212KB, עדיין 28KB מתחת לתקציב).
 */
const OtzariaSoftwareHeader = lazy(() => import('@/components/layout/OtzariaSoftwareHeader'))

export default function NotFoundHeader() {
  return (
    // fallback בגובה הכותרת וברקע שלה — רק אם הצ'אנק עוד לא הגיע בניווט צד-לקוח
    <Suspense fallback={<div aria-hidden="true" className="h-(--site-header-height) w-full bg-top-bar" />}>
      <OtzariaSoftwareHeader />
    </Suspense>
  )
}
