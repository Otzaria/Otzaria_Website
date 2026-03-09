import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const body = await request.json()
    console.log('[DICTA_SCROLL_DEBUG]', JSON.stringify(body, null, 2))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DICTA_SCROLL_DEBUG_ERROR]', error)
    return NextResponse.json({ ok: false, error: 'Failed to record debug payload' }, { status: 500 })
  }
}
