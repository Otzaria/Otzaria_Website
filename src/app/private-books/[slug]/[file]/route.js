import { readFile } from 'node:fs/promises'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import Book from '@/models/Book'
import { canReadBook } from '@/lib/privateBooks'
import { resolvePrivateBookPath } from '@/lib/ocr/privateBookStorage'

export async function GET(_request, { params }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  const { slug, file } = await params
  let filename
  try { filename = resolvePrivateBookPath(`/private-books/${slug}/${file}`) }
  catch { return new Response(null, { status: 404, headers }) }
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response(null, { status: 404, headers })
  await connectDB()
  const book = await Book.findOne({ slug, isPrivate: true, privateOcr: true }).lean()
  if (!canReadBook(book, session.user)) return new Response(null, { status: 404, headers })
  try {
    const bytes = await readFile(/*turbopackIgnore: true*/ filename)
    return new Response(bytes, { headers: { ...headers, 'Content-Type': 'image/jpeg' } })
  } catch (error) {
    if (error.code === 'ENOENT') return new Response(null, { status: 404, headers })
    throw error
  }
}
