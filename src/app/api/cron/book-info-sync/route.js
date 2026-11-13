import { NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import { authorizeCron } from '@/lib/corrections/runtime'
import { requestSync } from '@/lib/bookinfo/service'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * מעדכן עריכות מידע-על-ספרים שמוזגו/נסגרו, ובונה מחדש מעל main PR-ים ש-main התקדם תחתם.
 * נקרא מ-cron עם CRON_SECRET (כמו שאר ה-cron-ים). אימות OIDC של GitHub, כמו בכינויים, מקודד שם
 * לריפו הכינויים בלבד, ולכן לא נתמך כאן.
 */
async function run(request) {
  if (!authorizeCron(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await connectDB()
    return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...(await requestSync()) })
  } catch (error) {
    console.error('Book info sync cron error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request) {
  return run(request)
}

export async function POST(request) {
  return run(request)
}
