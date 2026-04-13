import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; 
import connectDB from '@/lib/db';    
import User from '@/models/User';         

// שליפת נתונים
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const user = await User.findOne({ email: session.user.email }).select('savedSearches');
    
    return NextResponse.json({ success: true, savedSearches: user?.savedSearches || [] });
  } catch (error) {
    console.error('Error fetching searches:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { savedSearches } = await req.json();
    
    await connectDB();
    
    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: { savedSearches: savedSearches } },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, savedSearches: updatedUser.savedSearches });
  } catch (error) {
    console.error('Error saving searches:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
