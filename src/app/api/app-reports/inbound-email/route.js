import { handleInboundEmailPost } from '@/lib/app-reports/inbound-handler';
import { saveFileToGridFS, deleteFileFromGridFS } from '@/lib/gridfs-service';

export const dynamic = 'force-dynamic';

// צרכן חיצוני: ה-Email Worker של Cloudflare (workers/app-reports-inbound). חוזה הסטטוסים — בקובץ ה-handler.
export async function POST(request) {
  return handleInboundEmailPost(request, { saveFile: saveFileToGridFS, deleteFile: deleteFileFromGridFS });
}
