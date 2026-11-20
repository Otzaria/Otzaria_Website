export const maxDuration = 300;
import { createStartHandler } from '@/lib/ocr/startBookOcr';

const handle = createStartHandler(true);

export async function POST(request) {
  const response = await handle(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
