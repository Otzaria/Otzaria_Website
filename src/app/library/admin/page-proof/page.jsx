// ניהול "הגהה" (לשעבר "הגהה לאימון המודלים"; docs/75 בפרויקט ה-OCR; docs/76 §8.2–§8.3): הכתובת הזו מציגה את מסך
// הניהול החדש, והעורך הישן של הגהת-העמודים כבר לא נפתח ממנה (ה-15). הקוד הישן (components/pageProof/*,
// lib/pageProof/*) נשאר במאגר בחלקו (ה-API ותוכנת-הספר עדיין משתמשים בו); רכיבי הניהול הישנים הוסרו.
//
// הגישה — מנהל כללי, מנהל OCR ומאמן מודלים (hasOcrAccess), וגם כל נתיבי ה-API של המסך בודקים זאת בשרת. מי שאין
// לו הרשאה רואה "אין לך הרשאה" (קודם — הפניה ללוח הניהול); מי שלא מחובר — ה-proxy מפנה להתחברות.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasOcrAccess } from '@/lib/roles'
import NoAccess from '@/components/admin/list/NoAccess'
import TrainingProofAdmin from '@/components/trainingProof/admin/TrainingProofAdmin'

export default async function TrainingProofAdminPage() {
  const session = await getServerSession(authOptions)
  if (!hasOcrAccess(session?.user)) {
    return <NoAccess description="המסך פתוח למנהל כללי, למנהל OCR ולמאמן מודלים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  return <TrainingProofAdmin />
}
