import { NextResponse } from 'next/server'
import crypto from 'crypto'
import connectDB from '@/lib/db'
import PluginReport from '@/models/PluginReport'
import Plugin from '@/models/Plugin'
import User from '@/models/User'
import { checkRateLimit } from '@/lib/rate-limit'
import { validateEmail } from '@/lib/validation-utils'
import { parsePluginRef } from '@/lib/pluginRef'
import { sendPluginReportNotification } from '@/lib/emailService'

const REPORT_TYPES = ['bug', 'crash', 'content', 'other']
const MAX_DETAILS_LENGTH = 5000

// חלון מניעת כפילות: דיווח זהה על אותו תוסף לא נרשם שוב בתוך פרק זמן זה
const DEDUP_WINDOW_MONTHS = 6

function getClientIp(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
}

function computeContentHash(pluginUid, reportType, details) {
  return crypto.createHash('sha256')
    .update([pluginUid, reportType, details].join('\0'))
    .digest('hex')
}

function getDedupCutoff() {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - DEDUP_WINDOW_MONTHS)
  return cutoff
}

// איתור התוסף לפי מזהה ה-manifest; תוספים ותיקים ללא pluginUid מזוהים
// לפי ObjectId אם האפליקציה שלחה כזה.
async function resolvePlugin(pluginUid) {
  const byUid = await Plugin.findOne({ pluginUid }).select('_id name slug version author authorId').lean()
  if (byUid) return byUid

  const { id } = parsePluginRef(pluginUid)
  if (!id) return null
  return Plugin.findById(id).select('_id name slug version author authorId').lean()
}

// POST /api/plugin-reports - דיווח משתמש על תוסף מותקן, נשלח מתוכנת אוצריא.
// ציבורי ולא מאומת; כשל בשליחת המייל אינו מפיל את הבקשה — הדיווח נשמר.
export async function POST(request) {
  try {
    if (!checkRateLimit(getClientIp(request), 'plugin-report', 5, 'minute')) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const reportId = typeof body?.reportId === 'string' ? body.reportId.trim().slice(0, 100) : ''
    if (!reportId) {
      return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 })
    }

    const pluginUid = typeof body.pluginUid === 'string' ? body.pluginUid.trim().slice(0, 200) : ''
    if (!pluginUid) {
      return NextResponse.json({ error: 'Invalid pluginUid' }, { status: 400 })
    }

    const details = typeof body.details === 'string' ? body.details.slice(0, MAX_DETAILS_LENGTH).trim() : ''
    if (!details) {
      return NextResponse.json({ error: 'Invalid details' }, { status: 400 })
    }

    const reportType = REPORT_TYPES.includes(body.reportType) ? body.reportType : 'other'
    const pluginName = typeof body.pluginName === 'string' ? body.pluginName.slice(0, 200).trim() : ''
    const pluginVersion = typeof body.pluginVersion === 'string' ? body.pluginVersion.slice(0, 30).trim() : ''
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 30).trim() : ''
    const platform = typeof body.platform === 'string' ? body.platform.slice(0, 30).trim() : ''

    // כתובת מענה פגומה אינה פוסלת את הדיווח — היא פשוט אינה נשמרת
    const rawReporterEmail = typeof body.reporterEmail === 'string' ? body.reporterEmail.trim().slice(0, 254) : ''
    const reporterEmail = rawReporterEmail && validateEmail(rawReporterEmail).isValid ? rawReporterEmail : null

    await connectDB()

    const contentHash = computeContentHash(pluginUid, reportType, details)

    const existingSameContent = await PluginReport.findOne({
      contentHash,
      createdAt: { $gte: getDedupCutoff() }
    }).select('_id').lean()

    if (existingSameContent) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    const plugin = await resolvePlugin(pluginUid)
    const developerId = plugin?.authorId || null

    // upsert אטומי לפי reportId — שליחה חוזרת של אותו דיווח לא יוצרת רשומה שנייה
    const before = await PluginReport.findOneAndUpdate(
      { reportId },
      {
        $setOnInsert: {
          reportId,
          pluginUid,
          pluginId: plugin?._id || null,
          pluginName: pluginName || plugin?.name || '',
          pluginVersion,
          developerId,
          reporterEmail,
          reportType,
          details,
          appVersion,
          platform,
          contentHash,
          status: 'pending'
        }
      },
      { upsert: true }
    )

    if (before) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    if (developerId) {
      await notifyDeveloper({
        reportId,
        developerId,
        plugin,
        pluginName: pluginName || plugin?.name || '',
        pluginVersion,
        reportType,
        details,
        reporterEmail,
        appVersion,
        platform
      })
    }

    return NextResponse.json({ success: true, reportId })
  } catch (error) {
    console.error('Error saving plugin report:', error)
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
  }
}

// התראה למפתח: מייל בלבד, לכתובת הרשומה שלו באתר. כישלון כאן נרשם ללוג
// בלבד, כדי שדיווח שכבר נשמר לא יוחזר למשתמש ככישלון.
async function notifyDeveloper(params) {
  const { reportId, developerId, plugin } = params
  try {
    const developer = await User.findById(developerId).select('name email').lean()
    if (!developer) return

    const update = {}

    const mailResult = await sendPluginReportNotification({
      recipientEmail: developer.email,
      recipientName: developer.name,
      pluginName: params.pluginName,
      pluginVersion: params.pluginVersion,
      // דף התוסף מקבל ObjectId בלבד (ראו parsePluginRef), לא slug
      pluginSlugOrId: plugin?._id?.toString() || null,
      reportType: params.reportType,
      details: params.details,
      reporterEmail: params.reporterEmail,
      appVersion: params.appVersion,
      platform: params.platform
    })
    if (mailResult?.sent) update.emailSent = true

    if (Object.keys(update).length > 0) {
      update.notifiedAt = new Date()
      await PluginReport.updateOne({ reportId }, { $set: update })
    }
  } catch (error) {
    console.error('Plugin report developer notification failed:', error)
  }
}
