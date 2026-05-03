import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { GET as adminGET, PUT as adminPUT } from '@/app/api/admin/plugins/[id]/edit/route'

function forbiddenForAdmin() {
	return NextResponse.json(
		{ error: 'עריכת תוספים כמנהל זמינה רק בממשק הניהול.' },
		{ status: 403 }
	)
}

async function ensureNotAdmin() {
	const session = await getServerSession(authOptions)
	if (session?.user?.role === 'admin') {
		return forbiddenForAdmin()
	}
	return null
}

export async function GET(request, context) {
	const adminBlock = await ensureNotAdmin()
	if (adminBlock) {
		return adminBlock
	}

	return adminGET(request, context)
}

export async function PUT(request, context) {
	const adminBlock = await ensureNotAdmin()
	if (adminBlock) {
		return adminBlock
	}

	return adminPUT(request, context)
}
