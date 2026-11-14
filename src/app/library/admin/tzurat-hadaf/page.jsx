// ניהול צורת הדף (CONTRACT.md: /library/admin/tzurat-hadaf): מנהל כללי ומנהל ספרים בלבד (hasTzuratAdminAccess — כמו
// קודם, וכמו כל נתיבי /api/admin/tzurat-hadaf בשרת). ה-proxy כבר חוסם את שאר התפקידים ומפנה מי שלא מחובר להתחברות;
// מי שבכל זאת הגיע לכאן בלי הרשאה רואה "אין לך הרשאה" (קודם — הפניה ללוח הניהול), כמו בשאר מסכי הניהול.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasTzuratAdminAccess } from '@/lib/roles'
import NoAccess from '@/components/admin/list/NoAccess'
import TzuratScreen from '@/components/admin/tzurat/TzuratScreen'

export default async function TzuratHadafAdminPage() {
  const session = await getServerSession(authOptions)
  if (!hasTzuratAdminAccess(session?.user)) {
    return <NoAccess description="המסך פתוח למנהל כללי ולמנהל ספרים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  return <TzuratScreen />
}
