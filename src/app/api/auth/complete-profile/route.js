import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import PendingGoogleSignup from '@/models/PendingGoogleSignup';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { badRequest, serverError } from '@/lib/apiResponse';
import { buildEmailLookupQuery } from '@/lib/googleAuth';
import {
  suggestUsernameBase,
  pickAvailableUsername,
  validateUsername,
} from '@/lib/googleSignup';
import { z } from 'zod';

const INVALID_TOKEN = 'הקישור להשלמת ההרשמה אינו תקין או שפג תוקפו. יש להתחיל מחדש מדף ההרשמה.';

const completeSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  acceptReminders: z.boolean(),
});

async function findPending(token) {
  if (!token || typeof token !== 'string') return null;
  await connectDB();
  return PendingGoogleSignup.findOne({ token });
}

// שמות תפוסים הדומים לבסיס המוצע — לבחירת מספר פנוי בלי לטעון את כל המשתמשים.
async function takenNamesFor(base) {
  const docs = await User.find({ name: new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d*$`, 'i') })
    .select('name')
    .limit(1000);
  return docs.map((d) => d.name);
}

// GET — פרטי ההרשמה הממתינה (המייל שאומת ב-Google + הצעת שם משתמש פנוי).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const pending = await findPending(searchParams.get('token'));
    if (!pending) return badRequest(INVALID_TOKEN);

    const base = suggestUsernameBase(pending.googleName, pending.email);
    const suggestedName = pickAvailableUsername(base, await takenNamesFor(base));

    return NextResponse.json(
      { email: pending.email, suggestedName },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Complete profile (GET) error:', error);
    return serverError('שגיאה בשרת. נסה שוב מאוחר יותר.');
  }
}

// POST — יצירת המשתמש בפועל. אין סיסמה: החשבון נוצר דרך Google, והמייל כבר
// אומת על ידו (isVerified). קביעת סיסמה אפשרית בהמשך דרך "שכחתי סיסמה".
export async function POST(request) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(ip, 'register', 5, 'hour')) {
      return badRequest('יותר מדי ניסיונות הרשמה. נסה שוב מאוחר יותר.');
    }

    const parsed = completeSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest('נתונים לא תקינים');

    const { token, acceptReminders } = parsed.data;
    const name = parsed.data.name.trim();

    const nameError = validateUsername(name);
    if (nameError) return badRequest(nameError);

    if (!acceptReminders) {
      return badRequest('חובה לאשר את קבלת התזכורות כדי להירשם');
    }

    const pending = await findPending(token);
    if (!pending) return badRequest(INVALID_TOKEN);

    // מרוץ אפשרי: החשבון נוצר בינתיים (לשונית נוספת), או ששם המשתמש נתפס.
    const existing = await User.findOne({
      $or: [buildEmailLookupQuery(pending.email), { name }],
    });
    if (existing) {
      await PendingGoogleSignup.deleteOne({ _id: pending._id });
      const takenByEmail = existing.name !== name;
      return badRequest(
        takenByEmail
          ? 'כבר קיים חשבון עם כתובת המייל הזו. אפשר פשוט להתחבר עם Google.'
          : 'שם המשתמש הזה כבר תפוס, יש לבחור שם אחר.'
      );
    }

    await User.create({
      name,
      email: pending.email,
      role: 'user',
      points: 0,
      acceptReminders,
      isVerified: true,
    });

    // הטוקן חד-פעמי — נמחק מיד אחרי יצירת החשבון.
    await PendingGoogleSignup.deleteOne({ _id: pending._id });

    return NextResponse.json({ message: 'החשבון נוצר בהצלחה' }, { status: 201 });
  } catch (error) {
    // התנגשות על אינדקס ייחודי (שם/מייל) במרוץ בין שתי בקשות
    if (error?.code === 11000) {
      return badRequest('שם המשתמש הזה כבר תפוס, יש לבחור שם אחר.');
    }
    console.error('Complete profile (POST) error:', error);
    return serverError('שגיאה בשרת. נסה שוב מאוחר יותר.');
  }
}
