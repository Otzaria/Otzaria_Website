import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginRating from '@/models/PluginRating'
import { parsePluginRef } from '@/lib/pluginRef'
import { checkRateLimit } from '@/lib/rate-limit'
import { isPluginSuspended } from '@/lib/pluginVisibility'
import { isValidRatingValue, ratingFieldsForPublic, RATING_MIN, RATING_MAX } from '@/lib/pluginRating'
import { recomputePluginRating, findVerifiedInstall } from '@/lib/pluginRatingStore'

// דירוג תוסף בחנות — באתר בלבד, למשתמש מחובר, דירוג אחד לכל תוסף (עדכון דורס).
//   GET    — סיכום הדירוגים + הדירוג של המשתמש הנוכחי (אם מחובר)
//   POST   — קביעת/עדכון דירוג { value: 1..5 }
//   DELETE — הסרת הדירוג של המשתמש
//
// "דירוג מאומת": אם למשתמש יש רישום התקנה בפועל (PluginInstall — נרשם כשהתקנה
// ישירה מהאתר הצליחה), הדירוג מסומן ושוקל יותר בציון המיון. היעדר רישום אינו
// חוסם דירוג — התקנה ידנית של קובץ שהורד אינה מזוהה כלל.

const NOT_FOUND = () => NextResponse.json({ error: 'Plugin not found' }, { status: 404 })

// התוסף שאפשר לדרג: מאושר, לא מוסתר ולא מושהה. מושהה נחסם במכוון — הוא אינו
// בחנות, ואין טעם לאסוף עליו דירוגים בזמן שאינו זמין להתקנה.
async function loadRatablePlugin(rawId) {
  const { id, version } = parsePluginRef(rawId)
  if (!id || version === false) return null
  const plugin = await Plugin.findOne({ _id: id, isApproved: true, isHidden: false })
    .select('authorId version isSuspended ratingCount ratingAvg ratingVerifiedCount ratingBreakdown')
    .lean()
  if (!plugin || isPluginSuspended(plugin)) return null
  return plugin
}

function summaryPayload(plugin, myRating) {
  return {
    ...ratingFieldsForPublic(plugin),
    myRating: myRating
      ? { value: myRating.value, verifiedInstall: myRating.verifiedInstall === true }
      : null
  }
}

export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id: rawId } = await params
    const plugin = await loadRatablePlugin(rawId)
    if (!plugin) return NOT_FOUND()

    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    const myRating = userId
      ? await PluginRating.findOne({ pluginId: plugin._id, userId }).select('value verifiedInstall').lean()
      : null

    return NextResponse.json(
      {
        ...summaryPayload(plugin, myRating),
        // האם המשתמש הנוכחי רשאי לדרג, ולמה לא
        canRate: Boolean(userId) && plugin.authorId?.toString() !== userId,
        isOwnPlugin: plugin.authorId?.toString() === userId
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching plugin rating:', error)
    return NextResponse.json({ error: 'Failed to fetch rating' }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'כדי לדרג תוסף יש להתחבר לאתר' }, { status: 401 })
    }
    if (!checkRateLimit(userId, 'plugin-rating', 20, 'minute')) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד רגע.' }, { status: 429 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const value = Number(body?.value)
    if (!isValidRatingValue(value)) {
      return NextResponse.json(
        { error: `הדירוג חייב להיות מספר שלם בין ${RATING_MIN} ל-${RATING_MAX}` },
        { status: 400 }
      )
    }

    await dbConnect()
    const { id: rawId } = await params
    const plugin = await loadRatablePlugin(rawId)
    if (!plugin) return NOT_FOUND()

    // מפתח אינו מדרג את התוסף של עצמו
    if (plugin.authorId?.toString() === userId) {
      return NextResponse.json({ error: 'לא ניתן לדרג תוסף שהעלית בעצמך' }, { status: 403 })
    }

    const install = await findVerifiedInstall(userId, plugin._id)
    await PluginRating.findOneAndUpdate(
      { pluginId: plugin._id, userId },
      {
        $set: {
          value,
          pluginVersion: plugin.version || null,
          // האימות נקבע מחדש בכל דירוג — מי שהתקין בינתיים מקבל אותו בעדכון
          verifiedInstall: Boolean(install),
          verifiedVersion: install?.version || null
        }
      },
      { upsert: true, new: true }
    )

    const aggregate = await recomputePluginRating(plugin._id)
    return NextResponse.json({
      success: true,
      ...ratingFieldsForPublic(aggregate),
      myRating: { value, verifiedInstall: Boolean(install) },
      message: install
        ? 'הדירוג נשמר. תודה! הדירוג סומן כמאומת (התקנה בפועל).'
        : 'הדירוג נשמר. תודה!'
    })
  } catch (error) {
    // מרוץ בין שתי בקשות מקבילות של אותו משתמש — האינדקס הייחודי תפס
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'הדירוג כבר נשמר. נסו לרענן את הדף.' }, { status: 409 })
    }
    console.error('Error saving plugin rating:', error)
    return NextResponse.json({ error: 'Failed to save rating' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 })
    }
    if (!checkRateLimit(userId, 'plugin-rating', 20, 'minute')) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד רגע.' }, { status: 429 })
    }

    await dbConnect()
    const { id: rawId } = await params
    const plugin = await loadRatablePlugin(rawId)
    if (!plugin) return NOT_FOUND()

    const deleted = await PluginRating.findOneAndDelete({ pluginId: plugin._id, userId })
    if (!deleted) {
      return NextResponse.json({ error: 'לא נמצא דירוג שלך לתוסף זה' }, { status: 404 })
    }

    const aggregate = await recomputePluginRating(plugin._id)
    return NextResponse.json({
      success: true,
      ...ratingFieldsForPublic(aggregate),
      myRating: null,
      message: 'הדירוג הוסר.'
    })
  } catch (error) {
    console.error('Error deleting plugin rating:', error)
    return NextResponse.json({ error: 'Failed to delete rating' }, { status: 500 })
  }
}
