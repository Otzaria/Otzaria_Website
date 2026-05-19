import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const MAX_FILE_SIZE_MB = 20;
const FETCH_TIMEOUT_MS = 30_000;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'application/pdf'];

function getOcrEndpoints() {
  const endpoints = [];
  if (process.env.OCRWIN_URL) {
    endpoints.push({ url: process.env.OCRWIN_URL, key: process.env.OCRWIN_API_KEY });
  }
  for (let i = 2; i <= 10; i++) {
    const url = process.env[`OCRWIN_URL${i}`];
    const key = process.env[`OCRWIN_API_KEY${i}`] || process.env.OCRWIN_API_KEY;
    if (url) endpoints.push({ url, key });
  }
  return endpoints;
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function sendToOcr(file, url, apiKey, attempt) {
  const remoteFormData = new FormData();
  remoteFormData.append('file', file, 'image.jpg');

  let response;
  try {
    response = await fetchWithTimeout(
      url,
      { method: 'POST', headers: { 'X-API-Key': apiKey }, body: remoteFormData },
      FETCH_TIMEOUT_MS
    );
  } catch (networkError) {
    const reason = networkError.name === 'AbortError'
      ? `timeout after ${FETCH_TIMEOUT_MS / 1000}s`
      : networkError.message;
    throw new Error(`[Endpoint ${attempt}] Network error connecting to ${url}: ${reason}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(could not read response body)');
    throw new Error(`[Endpoint ${attempt}] HTTP ${response.status} from ${url}: ${errorText}`);
  }

  const rawText = await response.text().catch(() => null);
  if (!rawText || rawText.trim() === '') {
    throw new Error(`[Endpoint ${attempt}] Empty response body from ${url} (HTTP ${response.status})`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (parseError) {
    throw new Error(
      `[Endpoint ${attempt}] Invalid JSON from ${url}: ${parseError.message}. ` +
      `Response body (first 200 chars): ${rawText.slice(0, 200)}`
    );
  }

  return data;
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let incomingData;
    try {
      incomingData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Failed to parse request form data' }, { status: 400 });
    }

    const file = incomingData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // בדיקת סוג קובץ
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` },
        { status: 415 }
      );
    }

    // בדיקת גודל קובץ
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum allowed: ${MAX_FILE_SIZE_MB}MB` },
        { status: 413 }
      );
    }

    const endpoints = getOcrEndpoints();
    if (endpoints.length === 0) {
      return NextResponse.json(
        { error: 'No OCR endpoints configured (missing OCRWIN_URL env var)' },
        { status: 500 }
      );
    }

    const errors = [];
    for (let i = 0; i < endpoints.length; i++) {
      const { url, key } = endpoints[i];

      try {
        const data = await sendToOcr(file, url, key, i + 1);
        if (i > 0) {
          console.log(`OCRWIN: succeeded on fallback endpoint ${i + 1} (${url})`);
        }
        return NextResponse.json({
          success: true,
          text: data.text || data.content || (typeof data === 'string' ? data : ''),
        });
      } catch (err) {
        console.error(`OCRWIN endpoint ${i + 1} failed:`, err.message);
        errors.push(`endpoint ${i + 1}: ${err.message}`);
      }
    }

    const combinedError = `All ${endpoints.length} OCR endpoint(s) failed:\n` + errors.join('\n');
    console.error('OCRWIN: all endpoints exhausted:', combinedError);
    return NextResponse.json({ error: combinedError }, { status: 502 });

  } catch (error) {
    console.error('OCRWIN Proxy Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
