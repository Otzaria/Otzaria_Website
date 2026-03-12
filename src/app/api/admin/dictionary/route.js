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

    const entries = users.flatMap(user =>
      (user.spellWords || [])
        .filter(Boolean)
        .map(word => ({
          userId: user._id.toString(),
          name: user.name || '',
          email: user.email || '',
          word
        }))
    );

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

    const needsUserId = new Set(["remove-personal", "skip", "unskip"])
    if (needsUserId.has(action) && !userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    switch (action) {
      case "add-global": {
        await SpellWord.findOneAndUpdate(
          { word: clean },
          { $setOnInsert: { word: clean, addedBy: session.user?.email || "" } },
          { upsert: true, new: true }
        )
        if (userId) {
          await User.updateOne({ _id: userId }, { $pull: { spellWords: clean } })
          await SpellWordSkip.deleteOne({ userId, word: clean })
        }
        return NextResponse.json({ success: true })
      }
      case "remove-personal": {
        await User.updateOne({ _id: userId }, { $pull: { spellWords: clean } })
        await SpellWordSkip.deleteOne({ userId, word: clean })
        return NextResponse.json({ success: true })
      }
      case "skip": {
        await SpellWordSkip.findOneAndUpdate(
          { userId, word: clean },
          { $setOnInsert: { userId, word: clean, skippedBy: session.user?.email || "" } },
          { upsert: true, new: true }
        )
        return NextResponse.json({ success: true })
      }
      case "unskip": {
        await SpellWordSkip.deleteOne({ userId, word: clean })
        return NextResponse.json({ success: true })
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }

  } catch (error) {
    console.error('Admin dictionary POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
