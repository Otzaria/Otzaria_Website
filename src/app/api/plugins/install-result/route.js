import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import PluginInstallToken from '@/models/PluginInstallToken'
import { checkRateLimit } from '@/lib/rate-limit'

// טוקנים נוצרים ב-base64url באורך קבוע — כל דבר אחר נדחה לפני גישה ל-DB.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/

function getClientIp(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

// POST /api/plugins/install-result - דיווח תוצאת התקנה מהאפליקציה.
// גוף הבקשה: { token, status: 'success' | 'failure', error?, appVersion? }
// חד-פעמי: רק טוקן במצב pending שטרם פג ניתן לעדכון.
export async function POST(request) {
  try {
    if (!checkRateLimit(getClientIp(request), 'plugin-install-report', 30, 'minute')) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { token, status } = body || {}
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }
    if (status !== 'success' && status !== 'failure') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const errorMessage = status === 'failure' && typeof body.error === 'string'
      ? body.error.slice(0, 500)
      : null
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 30) : null

    await dbConnect()
    const updated = await PluginInstallToken.findOneAndUpdate(
      { token, status: 'pending', expiresAt: { $gt: new Date() } },
      { status, errorMessage, appVersion, reportedAt: new Date() }
    )
    if (!updated) {
      return NextResponse.json({ error: 'Token not found, expired or already reported' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error reporting plugin install result:', error)
    return NextResponse.json({ error: 'Failed to report install result' }, { status: 500 })
  }
}

// GET /api/plugins/install-result?token=... - שאילתת סטטוס (polling מדף החנות).
// מחזיר { status: 'pending' | 'success' | 'failure', error? }.
export async function GET(request) {
  try {
    // מרווח polling של 2 שניות = 30 בקשות לדקה; משאירים מרווח לשני דפים במקביל.
    if (!checkRateLimit(getClientIp(request), 'plugin-install-poll', 90, 'minute')) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const token = new URL(request.url).searchParams.get('token') || ''
    if (!TOKEN_PATTERN.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    await dbConnect()
    const doc = await PluginInstallToken.findOne({ token }).select('status errorMessage expiresAt').lean()
    if (!doc || (doc.status === 'pending' && doc.expiresAt <= new Date())) {
      return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })
    }

    const payload = { status: doc.status }
    if (doc.status === 'failure' && doc.errorMessage) {
      payload.error = doc.errorMessage
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching plugin install result:', error)
    return NextResponse.json({ error: 'Failed to fetch install result' }, { status: 500 })
  }
}
