import { redirect } from 'next/navigation'

// רשת-העמודים הישנה של ספר בהגהת-העמודים — הדף יצא משימוש (docs/76 §8.2, ה-15)
export default function OldPageProofBookGrid() {
  redirect('/library/page-proof')
}
