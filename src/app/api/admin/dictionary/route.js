import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import SpellWord from '@/models/SpellWord';
import SpellWordSkip from '@/models/SpellWordSkip';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();

    const users = await User.find({ spellWords: { $exists: true, $ne: [] } })
      .select('name email spellWords')
      .lean();

    const entries = [];
    users.forEach(user => {
      (user.spellWords || []).forEach(word => {
        if (!word) return;
        entries.push({
          userId: user._id.toString(),
          name: user.name || '',
          email: user.email || '',
          word
        });
      });
    });

    const skips = await SpellWordSkip.find({}).select('userId word -_id').lean();
    const skipped = skips.map(item => ({ userId: item.userId?.toString(), word: item.word }));

    return NextResponse.json({ success: true, entries, skipped });
  } catch (error) {
    console.error('Admin dictionary GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { action, userId, word } = await req.json();
    const clean = typeof word === 'string' ? word.trim() : '';

    if (!clean) {
      return NextResponse.json({ error: 'Invalid word' }, { status: 400 });
    }

    await connectDB();

    if (action === 'add-global') {
      await SpellWord.findOneAndUpdate(
        { word: clean },
        { $setOnInsert: { word: clean, addedBy: session.user?.email || '' } },
        { upsert: true, new: true }
      );
      if (userId) {
        await SpellWordSkip.deleteOne({ userId, word: clean });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'remove-personal') {
      if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
      await User.updateOne({ _id: userId }, { $pull: { spellWords: clean } });
      await SpellWordSkip.deleteOne({ userId, word: clean });
      return NextResponse.json({ success: true });
    }

    if (action === 'skip') {
      if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
      await SpellWordSkip.findOneAndUpdate(
        { userId, word: clean },
        { $setOnInsert: { userId, word: clean, skippedBy: session.user?.email || '' } },
        { upsert: true, new: true }
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'unskip') {
      if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
      await SpellWordSkip.deleteOne({ userId, word: clean });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin dictionary POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
