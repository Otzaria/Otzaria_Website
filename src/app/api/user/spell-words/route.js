import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const user = await User.findOne({ email: session.user.email }).select('spellWords');
    return NextResponse.json({ success: true, spellWords: user?.spellWords || [] });
  } catch (error) {
    console.error('Error fetching spell words:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { word } = await req.json();
    const clean = typeof word === 'string' ? word.trim() : '';
    if (!clean) {
      return NextResponse.json({ error: 'Invalid word' }, { status: 400 });
    }

    await connectDB();
    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      { $addToSet: { spellWords: clean } },
      { returnDocument: 'after' }
    ).select('spellWords');

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, spellWords: updatedUser.spellWords });
  } catch (error) {
    console.error('Error saving spell word:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
