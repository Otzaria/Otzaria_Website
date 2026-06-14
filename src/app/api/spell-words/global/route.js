import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import SpellWord from '@/models/SpellWord';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const words = await SpellWord.find({}).select('word -_id').lean();
    const list = words.map(item => item.word).filter(Boolean);
    return NextResponse.json({ success: true, words: list });
  } catch (error) {
    console.error('Error fetching global spell words:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
