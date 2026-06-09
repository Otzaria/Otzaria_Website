import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'public', 'uploads');

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

export async function GET(request, { params }) {
  const segments = (await params).path;
  const relative = segments.join('/');

  const resolved = path.resolve(UPLOAD_ROOT, relative);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep) && resolved !== UPLOAD_ROOT) {
    return new Response(null, { status: 403 });
  }

  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch (err) {
    if (err.code === 'ENOENT') return new Response(null, { status: 404 });
    throw err;
  }

  if (!stat.isFile()) return new Response(null, { status: 404 });

  const lastModified = stat.mtime.toUTCString();
  const etag = `"${stat.size}-${stat.mtimeMs}"`;

  if (
    request.headers.get('if-none-match') === etag ||
    request.headers.get('if-modified-since') === lastModified
  ) {
    return new Response(null, { status: 304 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';

  const stream = new ReadableStream({
    start(controller) {
      const fileStream = fs.createReadStream(resolved);
      fileStream.on('data', chunk => controller.enqueue(chunk));
      fileStream.on('end', () => controller.close());
      fileStream.on('error', err => controller.error(err));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'Last-Modified': lastModified,
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
