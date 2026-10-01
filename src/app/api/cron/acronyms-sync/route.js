import { NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import { authorizeCron } from '@/lib/corrections/runtime'
import { verifyActionsToken } from '@/lib/acronyms/github-oidc'
import { requestSync } from '@/lib/acronyms/service'

export const dynamic = 'force-dynamic'

/**
 * מעדכן סלי כינויים שמוזגו/נסגרו בפורק, ובונה מחדש מעל master סלים שהוא התקדם תחתם.
 * נקרא מ-workflow בפורק אחרי כל מיזוג, עם אסימון OIDC של GitHub (בלי סוד), או מ-cron עם CRON_SECRET.
 */
async function run(request) {
  if (authorizeCron(request).ok) {
    try {
      await connectDB()
      return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...(await requestSync()) })
    } catch (error) {
      console.error('Acronyms sync cron error:', error)
      return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    }
  }

  const header = request.headers.get('authorization') || ''
  const github = await verifyActionsToken(header.startsWith('Bearer ') ? header.slice(7) : '').catch((err) => ({ ok: false, error: err.message }))
  if (!github.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // בנייה מחדש של עשרות PR-ים ארוכה מהמגבלה של nginx; עונים מיד וממשיכים ברקע
  await connectDB()
  requestSync()
    .then((summary) => console.log('Acronyms sync after fork push:', JSON.stringify(summary)))
    .catch((error) => console.error('Acronyms sync after fork push failed:', error))
  return NextResponse.json({ success: true, accepted: true }, { status: 202 })
}

export async function GET(request) {
  return run(request)
}

export async function POST(request) {
  return run(request)
}
