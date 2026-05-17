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
    const { searchParams } = new URL(request.url)
    const includePending = searchParams.get('pending') === '1'
    await dbConnect()

    const plugin = await Plugin.findById(id)
    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === 'admin'
    const isOwner = plugin.authorId?.toString() === session?.user?.id

    if (includePending) {
      if (!plugin.pendingUpdate || (!isAdmin && !isOwner)) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
    } else if (!plugin.isApproved && !isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const source = includePending ? plugin.pendingUpdate : null
    const usePendingAsset = includePending && source?.assetSources?.pluginFile === 'pending'
    const fileExt = includePending ? (source?.pluginFileExt || plugin.pluginFileExt) : plugin.pluginFileExt
    const fileName = includePending ? (source?.pluginFileName || plugin.pluginFileName) : plugin.pluginFileName
    const filename = `${PLUGIN_FILE_BASENAME}${fileExt}`

    let buf
    try {
      buf = await readPluginAsset(id, filename, { pending: usePendingAsset })
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
      throw err
    }

    if (!includePending && plugin.isApproved) {
      // עדכון מונה הורדות רק לתוספים פומביים, לא בעת בדיקת מנהל
      plugin.incrementDownload().catch(e => console.error('Failed to increment download count:', e))
    }

    // בניית Content-Disposition התומך בשמות קובץ בעברית/Unicode (RFC 5987).
    // encodeURIComponent לא מקודד את ! ' ( ) * - מקודדים ידנית כדי לעמוד ב-RFC 3986.
    const rawName = fileName || `plugin${fileExt}`
    const asciiFallback = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_')
    const encodedName = encodeURIComponent(rawName)
      .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
        'Content-Length': buf.length.toString(),
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch (error) {
    console.error('Error downloading plugin:', error)
    return NextResponse.json({ error: 'Failed to download plugin' }, { status: 500 })
  }
}
