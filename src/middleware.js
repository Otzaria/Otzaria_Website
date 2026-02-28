import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // אם המשתמש מחובר ומנסה לגשת לדף ההתחברות - נעביר אותו לדשבורד
    if (path === '/library/auth/login' && !!token) {
      return NextResponse.redirect(new URL('/library/dashboard', req.url));
    }

    // הגנה על דפי אדמין - רק לבעלי תפקיד 'admin'
    if (path.startsWith('/library/admin')) {
      if (!token || token.role !== 'admin') {
        return NextResponse.redirect(new URL('/library/dashboard', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        // מאפשרים גישה לדף ההתחברות גם ללא טוקן (כדי שהמחשב לא ייתקע בלופ של הפניות)
        if (path === '/library/auth/login') {
          return true;
        }
        return !!token;
      }
    },
    pages: {
      signIn: '/library/auth/login',
    }
  }
);

export const config = {
  matcher: [
    '/library/dashboard/:path*',
    '/library/admin/:path*',
    '/library/upload/:path*',
    '/library/books/:path*',
    '/library/users/:path*',
    '/library/auth/login', // הוספנו את דף ההתחברות ל-matcher
    '/api/admin/((?!books/upload).*)', 
    '/api/upload-text/:path*'
  ]
};