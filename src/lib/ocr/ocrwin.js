// ============================================================
// לוגיקת OCR משותפת מול שרתי OCRWin.
// משמש גם את /api/ocrwin (עריכה ידנית מהדפדפן) וגם את מנגנון
// "OCR לספר שלם" ברקע. מקבל buffer/Blob ומחזיר טקסט, עם נפילה
// לשרתי גיבוי לפי משתני הסביבה OCRWIN_URL, OCRWIN_URL2 ...
// ============================================================

const FETCH_TIMEOUT_MS = 30_000;

export function getOcrEndpoints() {
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

async function sendToOcr(file, filename, url, apiKey, attempt) {
  const remoteFormData = new FormData();
  remoteFormData.append('file', file, filename);

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

// מבצע OCR על קובץ בודד (Blob/File) דרך שרתי OCRWin, עם נפילה לגיבויים.
// מחזיר את הטקסט שזוהה. זורק אם כל השרתים נכשלו.
export async function ocrwinRecognize(file, filename = 'image.jpg') {
  const endpoints = getOcrEndpoints();
  if (endpoints.length === 0) {
    throw new Error('No OCR endpoints configured (missing OCRWIN_URL env var)');
  }

  const errors = [];
  for (let i = 0; i < endpoints.length; i++) {
    const { url, key } = endpoints[i];
    try {
      const data = await sendToOcr(file, filename, url, key, i + 1);
      if (i > 0) {
        console.log(`OCRWIN: succeeded on fallback endpoint ${i + 1} (${url})`);
      }
      return data.text || data.content || (typeof data === 'string' ? data : '');
    } catch (err) {
      console.error(`OCRWIN endpoint ${i + 1} failed:`, err.message);
      errors.push(`endpoint ${i + 1}: ${err.message}`);
    }
  }

  throw new Error(
    `All ${endpoints.length} OCR endpoint(s) failed:\n` + errors.join('\n')
  );
}
