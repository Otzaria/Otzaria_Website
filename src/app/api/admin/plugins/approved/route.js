import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// GET - קבלת כל התוספים המאושרים (למנהלים)
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
    
    const plugins = await Plugin.find({ 
      isApproved: true, 
      isHidden: false 
    })
      .sort({ createdAt: -1 })
      .populate('authorId', 'name email')
      .populate('approvedBy', 'name email')
      .select('-pluginData -imageData -screenshots.data -__v')
      .lean()
    
    return NextResponse.json(plugins)
  } catch (error) {
    console.error('Error fetching approved plugins:', error)
    return NextResponse.json(
      { error: 'Failed to fetch approved plugins' },
      { status: 500 }
    )
  }
}
