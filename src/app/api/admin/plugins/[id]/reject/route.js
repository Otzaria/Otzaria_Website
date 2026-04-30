import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// DELETE - דחיית תוסף (מחיקה)
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }
    
    await dbConnect()
    const { id } = await params
    
    const plugin = await Plugin.findById(id)
    
    if (!plugin) {
      return NextResponse.json(
        { error: 'Plugin not found' },
        { status: 404 }
      )
    }
    
    // מחיקת התוסף ממסד הנתונים
    // כל הקבצים (תמונות, צילומי מסך, קובץ התוסף) מאוחסנים במסד הנתונים
    // ולכן נמחקים אוטומטית עם מחיקת המסמך
    await Plugin.findByIdAndDelete(id)
    
    return NextResponse.json({
      success: true,
      message: 'Plugin rejected and deleted successfully'
    })
  } catch (error) {
    console.error('Error rejecting plugin:', error)
    return NextResponse.json(
      { error: 'Failed to reject plugin' },
      { status: 500 }
    )
  }
}
