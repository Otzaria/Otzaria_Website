import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // ענף dev ולא main — בכוונה: הרישיון החדש (Personal Use License 1.0) קיים כרגע רק
    // ב-dev, וב-main של otzaria עדיין יש GPL. לחזור ל-main (כאן וב-src/app/license/page.jsx)
    // אחרי שהרישיון ימוזג ל-main.
    const res = await fetch('https://raw.githubusercontent.com/Otzaria/otzaria/dev/LICENSE', {
      next: { revalidate: 3600 } // רענון פעם בשעה
    });

    if (!res.ok) {
      throw new Error('Failed to fetch license from GitHub');
    }

    const text = await res.text();

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // ציבורי וזהה לכל המבקרים (לא תלוי session) — מותר במטמון CDN/דפדפן, TTL קצר.
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('License fetch error:', error);
    return new NextResponse('Error loading license', { status: 500 });
  }
}
