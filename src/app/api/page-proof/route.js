import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { requireProofSession, claimSequence, releaseLeases, volunteerStats } from '@/lib/pageProof/pool';
import { badRequest, serverError } from '@/lib/apiResponse';

// GET: הרצף הנוכחי של המתנדב (או רצף חדש) + סטטיסטיקה.
// ?skip=<bookId>:<seq> — הרצף שדולג עכשיו לא יוצע שוב באותה בקשה.
export async function GET(request) {
  const { userId, error } = await requireProofSession();
  if (error) return error;
  try {
    await connectDB();
    const skip = new URL(request.url).searchParams.get('skip');
    const [sequence, stats] = await Promise.all([claimSequence(userId, skip), volunteerStats(userId)]);
    return NextResponse.json(
      { success: true, sequence, stats },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof GET', e);
    return serverError();
  }
}

// POST {action:'release'}: שחרור הרצף המוחכר (דילוג)
export async function POST(request) {
  const { userId, error } = await requireProofSession();
  if (error) return error;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action !== 'release') return badRequest('פעולה לא מוכרת');
    await connectDB();
    const released = await releaseLeases(userId);
    return NextResponse.json({ success: true, released });
  } catch (e) {
    console.error('page-proof POST', e);
    return serverError();
  }
}
