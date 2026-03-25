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
        if (typeof credentials.identifier !== 'string' || typeof credentials.password !== 'string') {
          throw new Error('קלט לא חוקי');
        }
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

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          acceptReminders: user.acceptReminders,
          isVerified: user.isVerified,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.acceptReminders = user.acceptReminders;
        token.isVerified = user.isVerified;
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