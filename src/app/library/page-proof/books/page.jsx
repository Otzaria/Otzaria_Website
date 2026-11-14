import { redirect } from 'next/navigation'

// הנתיב הישן של בחירת הספרים בהגהת-העמודים — הדף יצא משימוש (docs/76 §8.2, ה-15).
// קישורים ישנים מגיעים לדף החדש "הגהה לאימון המודלים".
export default function OldPageProofBooks() {
  redirect('/library/page-proof')
}
