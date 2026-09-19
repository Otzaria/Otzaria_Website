import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { z } from 'zod';
import {
  GOOGLE_AUTH_ERRORS,
  isGoogleAuthConfigured,
  isGoogleProfileVerified,
  buildEmailLookupQuery,
  pickUserForEmail,
  toTokenUserFields,
} from '@/lib/googleAuth';

// סכמת אימות לקלט התחברות
const loginSchema = z.object({
  identifier: z.string().min(1, 'שם משתמש או אימייל נדרש').max(100, 'קלט ארוך מדי'),
  password: z.string().min(1, 'סיסמה נדרשת').max(128, 'סיסמה ארוכה מדי')
});

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Email or Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        // Rate limiting לפי IP אמין — מספר ה-proxy-ים נקבע ב-TRUSTED_PROXY_COUNT,
        // עם דילוג על כתובות פרטיות (ראו src/lib/client-ip.js). לא ניתן לעקוף
        // ע"י זיוף x-forwarded-for.
        const ip = getClientIp(req);
        const isAllowed = checkRateLimit(ip, 'login', 5, 'minute');
        
        if (!isAllowed) {
          throw new Error('יותר מדי ניסיונות התחברות. נסה שוב מאוחר יותר.');
        }

        // אימות קלט עם Zod
        const validationResult = loginSchema.safeParse(credentials);
        if (!validationResult.success) {
          throw new Error('נתונים לא תקינים');
        }

        const { identifier, password } = validationResult.data;

        await connectDB();
        
        const user = await User.findOne({
          $or: [
            { email: identifier },
            { name: identifier }
          ]
        });

        // הודעת שגיאה אחידה גם למשתמש שלא קיים וגם לסיסמה שגויה — מניעת
        // user-enumeration ישירות מול ה-endpoint (ה-UI כבר מאחד, אבל אפשר
        // לקרוא ל-API ישירות ולהשוות את ההודעות).
        if (!user) {
          throw new Error('פרטי התחברות שגויים');
        }

        const isValid = await compare(password, user.password);
        if (!isValid) {
          throw new Error('פרטי התחברות שגויים');
        }

        return toTokenUserFields(user);
      },
    }),
    // התחברות עם Google — רק לחשבונות קיימים, לפי המייל. הספק נרשם רק כשהסודות
    // מוגדרים; בלעדיהם הכפתור לא מוצג (הלקוח בודק מול /api/auth/providers).
    ...(isGoogleAuthConfigured()
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;

      const errorUrl = (code) => `/library/auth/error?error=${code}`;
      if (!isGoogleProfileVerified(profile)) return errorUrl(GOOGLE_AUTH_ERRORS.EMAIL_NOT_VERIFIED);

      const { user, error } = await findUserForGoogle(profile.email);
      if (!user) return errorUrl(error);

      // Google כבר אימת את בעלות המייל — מאמתים את החשבון אוטומטית.
      if (!user.isVerified) {
        await User.updateOne(
          { _id: user._id },
          { $set: { isVerified: true }, $unset: { verificationToken: 1, verificationTokenExpires: 1 } }
        );
      }
      return true;
    },
    async jwt({ token, user, account, profile, trigger }) {
      // ב-Google, `user` הוא פרופיל גוגל ולא המשתמש שלנו — טוענים את החשבון
      // מה-DB (signIn כבר אישר שקיים ואימת אותו).
      if (account?.provider === 'google') {
        const { user: dbUser } = await findUserForGoogle(profile?.email);
        if (!dbUser) throw new Error('החשבון לא נמצא');
        user = toTokenUserFields(dbUser);
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        delete token.picture;
      }

      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.acceptReminders = user.acceptReminders;
        token.isVerified = user.isVerified;
        token.isSupervisor = user.isSupervisor === true;
        token.isCorrectionsVolunteer = user.isCorrectionsVolunteer === true;
      }

      if (trigger === "update") {
        try {
          await connectDB();
          const freshUser = await User.findById(token.id);
          if (freshUser) {
            token.email = freshUser.email;
            token.isVerified = freshUser.isVerified;
            token.acceptReminders = freshUser.acceptReminders;
            token.role = freshUser.role;
            token.name = freshUser.name;
            token.isSupervisor = freshUser.isSupervisor === true;
            token.isCorrectionsVolunteer = freshUser.isCorrectionsVolunteer === true;
          }
        } catch (error) {
          console.error("Error refreshing user token:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user._id = token.id;
        session.user.email = token.email;
        session.user.role = token.role;
        session.user.name = token.name;
        session.user.acceptReminders = token.acceptReminders;
        session.user.isVerified = token.isVerified;
        session.user.isSupervisor = token.isSupervisor === true;
        session.user.isCorrectionsVolunteer = token.isCorrectionsVolunteer === true;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/library/auth/error',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
};

async function findUserForGoogle(email) {
  if (!email) return { user: null, error: GOOGLE_AUTH_ERRORS.NO_ACCOUNT };
  await connectDB();
  const candidates = await User.find(buildEmailLookupQuery(email)).limit(5);
  return pickUserForEmail(candidates, email);
}

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };