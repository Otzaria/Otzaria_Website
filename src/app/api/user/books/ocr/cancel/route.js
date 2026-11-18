import { createCancelHandler } from '@/lib/ocr/cancelBookOcr';

const handle = createCancelHandler(true);

export async function POST(request) {
  const response = await handle(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
