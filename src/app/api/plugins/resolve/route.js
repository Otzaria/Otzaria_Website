import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { hasPluginsAccess } from '@/lib/roles'

// ⚠️ API חיצוני — אינו נצרך ע"י ה-frontend של האתר הזה. הצרכן היחיד הוא ה-GitHub
// Action הרשמי "otzaria-plugin-validator" (פרסום אוטומטי של תוספים מ-CI).
// אין מאחוריו קריאה מקוד האתר, אז אל תסירו אותו כ"קוד מת" — הסרתו תשבור פרסום
// אוטומטי של מפתחי תוספים. ראו: https://github.com/Otzaria/otzaria-plugin-validator
//
// מאתר תוסף לפי המזהה שב-manifest.json (pluginUid) ומחזיר את ה-_id הפנימי, כדי
// שה-Action יזהה תוסף קיים ויעדכן אותו (במקום ליצור כפילות) בלי לדעת מראש את ה-_id.
// מחזיר את ה-_id רק לבעלים או למנהל; אחרת מציין שהתוסף קיים בלי לחשוף אותו.
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 })
    }

    const uid = (new URL(request.url).searchParams.get('uid') || '').trim()
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid query parameter' }, { status: 400 })
    }

    await dbConnect()
    // מכוון: ללא סינון isApproved — תוסף שנוצר זה עתה וממתין לאישור מנהל חייב
    // להיפתר גם הוא, אחרת הדחיפה הבאה תנסה ליצור אותו מחדש ותיכשל ככפילות.
    const plugin = await Plugin.findOne({ pluginUid: uid })
      .select('_id authorId isHidden')
      .lean()

    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ exists: false })
    }

    const isAdmin = hasPluginsAccess(session.user?.role)
    const isOwner = plugin.authorId?.toString() === session.user?.id
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ exists: true, owned: false })
    }

    return NextResponse.json({ exists: true, owned: true, id: plugin._id.toString() })
  } catch (error) {
    console.error('Error resolving plugin by uid:', error)
    return NextResponse.json({ error: 'Failed to resolve plugin' }, { status: 500 })
  }
}
