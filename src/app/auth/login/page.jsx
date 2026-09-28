import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import LoginForm from './LoginForm'
import { firstSearchParam, getSafeCallbackUrl, loginErrorMessage } from '@/lib/loginRedirect'
import { isGoogleAuthConfigured } from '@/lib/googleAuth'

// רכיב שרת: הפרמטרים (callbackUrl, error) נקראים כאן ועוברים לטופס כ-props, כך
// שהטופס כולו — כולל הודעת "פעולה זו דורשת התחברות" והודעת שגיאה מה-URL — מגיע
// מוכן ב-HTML. קודם הדף היה רכיב לקוח עם useSearchParams בתוך Suspense, ולכן
// השרת שלח רק ספינר והטופס צויר רק אחרי ה-JavaScript ו-/api/auth/session.
// קריאת searchParams הופכת את הדף לדינמי; אין בו גישה ל-DB, והרינדור זניח.
export default async function LoginPage({ searchParams }) {
  const params = await searchParams
  const callbackUrl = firstSearchParam(params?.callbackUrl)
  const errorType = firstSearchParam(params?.error)

  // משתמש שכבר מחובר מופנה כבר בשרת (307 לפני כל HTML), כך שאינו רואה את
  // הטופס עד שה-JavaScript ו-/api/auth/session מגלים שהוא מחובר. פענוח JWT
  // בלבד, בלי DB. ההפניה בצד הלקוח בטופס נשארת להתחברות בלשונית אחרת.
  const session = await getServerSession(authOptions)
  if (session) redirect(getSafeCallbackUrl(callbackUrl))

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-bl from-primary-container via-background to-secondary-container">
      {/* key: ניווט צד-לקוח לאותו דף עם פרמטרים אחרים מאתחל את הטופס, כמו
          שה-useEffect על searchParams עשה קודם להודעת השגיאה */}
      <LoginForm
        key={`${callbackUrl ?? ''}|${errorType ?? ''}`}
        callbackUrl={callbackUrl}
        initialError={loginErrorMessage(errorType)}
        googleEnabled={isGoogleAuthConfigured()}
      />
    </div>
  )
}
