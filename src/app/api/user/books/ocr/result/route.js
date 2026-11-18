import { createExportTextHandler } from '@/lib/ocr/exportBookText';

const handle = createExportTextHandler(true);

export async function GET(request) {
  const response = await handle(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
