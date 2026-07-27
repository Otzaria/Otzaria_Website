import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const isAllowed = checkRateLimit(ip, 'gemini-ocr', 5); // 5 בקשות לדקה

    if (!isAllowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    const { imageBase64, model = 'gemini-1.5-flash' } = await request.json();

    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 });

    // codeql[js/request-forgery]: the host is fixed, so `model` can't redirect the request
    // to another origin — but validating it against Google's model-name charset closes the
    // request-smuggling/malformed-URL angle with no effect on any real model name.
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Transcribe this Hebrew text exactly as is." }, // System prompt
              { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
            ]
          }]
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({ success: true, text });

  } catch (error) {
    console.error('Gemini Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}