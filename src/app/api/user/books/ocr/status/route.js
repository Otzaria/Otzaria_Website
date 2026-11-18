import { createStatusHandler } from '@/lib/ocr/statusBookOcr';

const handle = createStatusHandler(true);

export async function GET(request) {
  const response = await handle(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
