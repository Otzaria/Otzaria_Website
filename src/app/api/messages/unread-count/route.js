import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyAdminAccess } from '@/lib/roles';
import { countUnreadAdminMessages } from '@/lib/adminMessages';
import { requireAccess, serverError } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

// מספר ההודעות שלא נקראו בתור הניהול, לתג שבכותרת. מחליף את
// GET /api/messages?allMessages=true (כל התור, ~1.4MB בנתוני בדיקה) שנמשך בכל
// דף בספרייה ובכל דקה רק כדי לספור status==='unread'. אותה הרשאה כמו ענף
// allMessages שם (hasAnyAdminAccess); ללא מטמון — המונה מתעדכן מיד אחרי קריאה.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasAnyAdminAccess);
    if (denied) return denied;

    const count = await countUnreadAdminMessages();
    return NextResponse.json(
      { success: true, count },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error counting unread messages:', error);
    return serverError('Internal Server Error');
  }
}
