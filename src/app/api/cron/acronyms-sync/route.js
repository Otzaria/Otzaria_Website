import { NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import { authorizeCron } from '@/lib/corrections/runtime'
import { syncChangeSets } from '@/lib/acronyms/service'

export const dynamic = 'force-dynamic'

// מעדכן סלי כינויים שמוזגו/נסגרו בפורק, ובונה מחדש מעל master סלים שהוא התקדם תחתם.
async function run(request) {
  const auth = authorizeCron(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    await connectDB()
    const summary = await syncChangeSets()
    return NextResponse.json({ success: true, ranAt: new Date().toISOString(), ...summary })
  } catch (error) {
    console.error('Acronyms sync cron error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request) {
  return run(request)
}

export async function POST(request) {
  return run(request)
}
