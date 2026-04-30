import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset, PLUGIN_FILE_BASENAME } from '@/lib/pluginStorage'

// GET /api/plugins/[id]/download - הורדת קובץ התוסף.
// רק תוספים מאושרים פתוחים לציבור; מנהלים יכולים להוריד גם תוספים ממתינים לבדיקה.
export async function GET(request, { params }) {
  try {
    const { id } = await params
    await dbConnect()

    const plugin = await Plugin.findById(id)
    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (!plugin.isApproved) {
      const session = await getServerSession(authOptions)
      if (!session || session.user?.role !== 'admin') {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
    }

    const filename = `${PLUGIN_FILE_BASENAME}${plugin.pluginFileExt}`
    let buf
    try {
      buf = await readPluginAsset(id, filename)
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return NextResponse.json({ error: 'Plugin file not found' }, { status: 404 })
      }
      throw err
    }

    if (plugin.isApproved) {
      // עדכון מונה הורדות רק לתוספים פומביים, לא בעת בדיקת מנהל
      plugin.incrementDownload().catch(e => console.error('Failed to increment download count:', e))
    }

    // הסרת תווים מסוכנים משם הקובץ ב-Content-Disposition
    const safeName = (plugin.pluginFileName || `plugin${plugin.pluginFileExt}`).replace(/["\\\r\n]/g, '_')

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length': buf.length.toString(),
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch (error) {
    console.error('Error downloading plugin:', error)
    return NextResponse.json({ error: 'Failed to download plugin' }, { status: 500 })
  }
}
