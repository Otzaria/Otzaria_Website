import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import connectDB from '@/lib/db';
import User from '@/models/User';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Email or Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        await connectDB();
        
        const user = await User.findOne({
            $or: [
                { email: credentials.identifier },
                { name: credentials.identifier }
            ]
        });

        if (!user) {
          throw new Error('משתמש לא נמצא');
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error('סיסמה שגויה');
        }

        // כאן אנחנו מחזירים אובייקט עם 'id' (בלי קו תחתון)
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // user קיים רק בהתחברות הראשונית (Login)
      if (user) {
        // תיקון: משתמשים ב-user.id כי זה מה שהחזרנו ב-authorize
        token.id = user.id; 
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        // מעבירים את ה-ID מהטוקן לסשן
        session.user.id = token.id;
        // ליתר ביטחון, נגדיר גם _id לתאימות לאחור
        session.user._id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/library/auth/login',
    error: '/library/auth/error',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };