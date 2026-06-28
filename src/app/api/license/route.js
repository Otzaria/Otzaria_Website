import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/Otzaria/otzaria/main/LICENSE', {
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
      },
    });
  } catch (error) {
    console.error('License fetch error:', error);
    return new NextResponse('Error loading license', { status: 500 });
  }
}