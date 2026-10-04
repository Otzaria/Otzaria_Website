import { getServerSession } from 'next-auth'
import connectDB from '@/lib/db'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import BookInfo from '@/models/BookInfo'
import { hasBooksAccess } from '@/lib/roles';
import { BOOK_INFO_COLUMNS, bookInfoStateFromRows, exportBookInfoCsv } from '@/lib/bookinfo/csv'
import { createBookInfoClient, loadBookInfoState } from '@/lib/bookinfo/fork'

function isAdmin(session) {
  return hasBooksAccess(session?.user?.role)
}

/**
 * ForDB/book_info.csv בפורמט הקנוני (UTF-8 בלי BOM, LF, הכול במירכאות, ממוין).
 * מקור האמת הוא הקובץ בריפו otzaria-library. כל עוד הוא לא הועלה לשם, הייצוא נבנה מ-BookInfo
 * ב-Mongo, והקובץ שיורד הוא בדיוק מה שצריך להעלות כ-ForDB/book_info.csv.
 */
async function loadCsv() {
  try {
    const base = await loadBookInfoState(createBookInfoClient())
    return { source: 'repo', csv: exportBookInfoCsv(base.state) }
  } catch (error) {
    if (error?.code !== 'FILE_MISSING') throw error
  }
  await connectDB()
  const rows = await BookInfo.find({}).select(BOOK_INFO_COLUMNS.join(' ')).lean()
  return { source: 'mongo', csv: exportBookInfoCsv(bookInfoStateFromRows(rows)) }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!isAdmin(session)) {
      return new Response('Forbidden', { status: 403 })
    }

    const { source, csv } = await loadCsv()
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="book_info.csv"',
        'Cache-Control': 'private, no-store',
        'X-Book-Info-Source': source
      }
    })
  } catch (error) {
    console.error('GET /api/admin/book-info/export-csv failed:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
