import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { z } from 'zod';
import { apiError, badRequest, serverError } from '@/lib/apiResponse';

// סכמת אימות עם Zod
const registerSchema = z.object({
  name: z.string().min(1, 'שם חובה').max(50, 'שם ארוך מדי').trim(),
  email: z.string().email('כתובת אימייל לא תקינה').toLowerCase().trim(),
  password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים').max(128, 'סיסמה ארוכה מדי'),
  acceptReminders: z.boolean()
});

export async function POST(request) {
  try {
    // 1. אבטחה: Rate Limiting — IP אמין (req.ip / קצה XFF), לא הראשון הניתן לזיוף
    const ip = getClientIp(request);
    const isAllowed = checkRateLimit(ip, 'register', 5, 'hour');
    
    if (!isAllowed) {
        return apiError(429, 'יותר מדי ניסיונות הרשמה. נסה שוב מאוחר יותר.');
    }

    const body = await request.json();

    // אימות קלט עם Zod למניעת NoSQL Injection
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map(err => err.message).join(', ');
      return badRequest(errors);
    }

    const { name, email, password, acceptReminders } = validationResult.data;

    if (!acceptReminders) {
      return badRequest('חובה לאשר את קבלת התזכורות כדי להירשם');
    }

    await connectDB();

    // בדיקה אם משתמש קיים
    const existingUser = await User.findOne({ $or: [{ email }, { name }] });
    if (existingUser) {
      return badRequest('משתמש עם אימייל או שם זה כבר קיים');
    }

    const hashedPassword = await hash(password, 12);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'user',
      points: 0,
      acceptReminders: acceptReminders
    });

    return NextResponse.json({ message: 'המשתמש נוצר בהצלחה', user: { id: user._id, name: user.name, email: user.email } }, { status: 201 });
  } catch (error) {
    console.error('Registration Error:', error);
    return serverError('שגיאה בשרת. נסה שוב מאוחר יותר.');
  }
}
