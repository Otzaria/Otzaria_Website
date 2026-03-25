import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Redirects מהנתיבים הישנים לחדשים
    // /library/book/* -> /library/books/*
    if (path.startsWith('/library/book/')) {
      const newPath = path.replace('/library/book/', '/library/books/');
      return NextResponse.redirect(new URL(newPath, req.url));
    }
    
    // /library/edit/* -> /library/books/*
    if (path.startsWith('/library/edit/')) {
      const newPath = path.replace('/library/edit/', '/library/books/');
      return NextResponse.redirect(new URL(newPath, req.url));
    }

    // הגנה על דפי אדמין - רק לבעלי תפקיד 'admin'
    if (path.startsWith('/library/admin') || path.startsWith('/api/admin')) {
      if (!token) {
        // אם אין טוקן בכלל - NextAuth יטפל בהפניה להתחברות עם callbackUrl
        return NextResponse.next();
      }
      if (token.role !== 'admin') {
        // אם יש טוקן אבל המשתמש לא אדמין - נעביר לדף שגיאה
        return NextResponse.redirect(new URL('/library/unauthorized', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // כל הדפים שב-matcher דורשים אימות
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
    '/library/book/:path*',      // נתיב ישן - יופנה ל-books
    '/library/edit/:path*',       // נתיב ישן - יופנה ל-books
    '/library/users/:path*',
    '/library/dicta-books/:path*',
    '/api/admin/((?!books/upload).*)', 
    '/api/upload-text/:path*'
  ]
};