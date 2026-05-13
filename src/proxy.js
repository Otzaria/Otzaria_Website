import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { hasAnyAdminAccess } from '@/lib/roles';

// נתיבי דפים המותרים לכל מנהל תוספים
const PLUGINS_ADMIN_ALLOWED_PAGES = [
  '/library/admin/plugins',
  '/library/admin/messages',
];
const PLUGINS_ADMIN_ALLOWED_PAGE_EXACT = ['/library/admin'];

// נתיבי API המותרים לכל מנהל תוספים
const PLUGINS_ADMIN_ALLOWED_API = [
  '/api/admin/plugins',
  '/api/admin/plugin-notifications',
  '/api/admin/users-basic',
  '/api/admin/stats',
];

// נתיבי דפים/API החסומים למנהל ספרים
const BOOKS_ADMIN_BLOCKED_PAGES = [
  '/library/admin/users',
  '/library/admin/plugins',
];
const BOOKS_ADMIN_BLOCKED_API = [
  '/api/admin/users',
  '/api/admin/plugins',
  '/api/admin/plugin-notifications',
  '/api/admin/export-backup',
];

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

    // הגנה על דפי ו-API של ניהול
    if (path.startsWith('/library/admin') || path.startsWith('/api/admin')) {
      if (!token) return NextResponse.next();

      const role = token.role;
      const isApiRoute = path.startsWith('/api/');

      const unauthorized = () =>
        isApiRoute
          ? NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
          : NextResponse.redirect(new URL('/library/unauthorized', req.url));

      // לא מנהל בכלל
      if (!hasAnyAdminAccess(role)) return unauthorized();

      // מנהל תוספים - dashboard, plugins ו-messages
      if (role === 'admin_plugins') {
        const allowed = isApiRoute
          ? PLUGINS_ADMIN_ALLOWED_API.some(p => path.startsWith(p))
          : PLUGINS_ADMIN_ALLOWED_PAGE_EXACT.includes(path) || PLUGINS_ADMIN_ALLOWED_PAGES.some(p => path.startsWith(p));
        if (!allowed) return unauthorized();
      }

      // מנהל ספרים - הכל חוץ ממשתמשים ותוספים
      if (role === 'admin_books') {
        const isBlocked = (list) => list.some(p => path === p || path.startsWith(p + '/'));
        const blocked = isApiRoute
          ? isBlocked(BOOKS_ADMIN_BLOCKED_API)
          : isBlocked(BOOKS_ADMIN_BLOCKED_PAGES);
        if (blocked) return unauthorized();
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
    '/plugins/upload/:path*',
    '/library/dashboard/:path*',
    '/library/admin/:path*',
    '/library/upload/:path*',
    '/library/books/:path*',
    '/library/book/:path*',      // נתיב ישן - יופנה ל-books
    '/library/edit/:path*',       // נתיב ישן - יופנה ל-books
    '/library/users/:path*',
    '/library/info/:path*',
    '/library/acronyms/:path*',
    '/library/dicta-books/:path*',
    '/api/admin/:path*', 
    '/api/library/book-info/:path*',
    '/api/library/book-acronyms/:path*',
    '/api/upload-text/:path*'
  ]
};
