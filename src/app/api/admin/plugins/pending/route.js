import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// GET - קבלת כל התוספים הממתינים לאישור
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }
    
    await dbConnect()
    
    const plugins = await Plugin.getPendingPlugins()
    
    return NextResponse.json(plugins)
  } catch (error) {
    console.error('Error fetching pending plugins:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending plugins' },
      { status: 500 }
    )
  }
}
