import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginInstallToken from '@/models/PluginInstallToken'
import { parsePluginRef } from '@/lib/pluginRef'
import { checkRateLimit } from '@/lib/rate-limit'
import { hasPluginsAccess } from '@/lib/roles'
import { canAccessSuspended, isPluginSuspended } from '@/lib/pluginVisibility'

// משך חיי טוקן התקנה — מספיק להורדה + התקנה, קצר מספיק שלא להצטבר.
const INSTALL_TOKEN_TTL_MS = 15 * 60 * 1000

// POST /api/plugins/[id]/install-token - יצירת טוקן מעקב להתקנה ישירה.
// פתוח לציבור (כמו ההורדה עצמה) עבור תוספים מאושרים בלבד.
export async function POST(request, { params }) {
  try {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    if (!checkRateLimit(ip, 'plugin-install-token', 20, 'minute')) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { id: rawId } = await params
    // תומך גם ב-<id>@<version> (התקנה מדף גרסה היסטורית), כמו ראוט ההורדה
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }
    await dbConnect()

    const plugin = await Plugin.findById(id).select('isApproved isHidden isSuspended authorId version')
    if (!plugin || plugin.isHidden || !plugin.isApproved) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    // תוסף מושהה — התקנה ישירה זמינה רק למעלה ולמנהלי התוספים, כמו ההורדה עצמה
    if (isPluginSuspended(plugin)) {
      const session = await getServerSession(authOptions)
      const isAdmin = hasPluginsAccess(session?.user?.role)
      const isOwner = plugin.authorId?.toString() === session?.user?.id
      if (!canAccessSuspended({ isAdmin, isOwner })) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
    }

    const expiresAt = new Date(Date.now() + INSTALL_TOKEN_TTL_MS)
    const doc = await PluginInstallToken.create({
      token: crypto.randomBytes(24).toString('base64url'),
      pluginId: plugin._id,
      version: version || plugin.version,
      expiresAt
    })

    return NextResponse.json({ token: doc.token, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    console.error('Error creating plugin install token:', error)
    return NextResponse.json({ error: 'Failed to create install token' }, { status: 500 })
  }
}
