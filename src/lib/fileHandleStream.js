export const STREAM_CHUNK_BYTES = 256 * 1024;

/**
 * FileHandle → ReadableStream של בדיוק `size` בתים החל מההיסט שנבחר. קריאה רק ב-pull, handle נסגר
 * בסוף/בשגיאה/בביטול (הלקוח התנתק).
 * @param {import('node:fs/promises').FileHandle} fh
 * @param {number} size
 * @param {{chunkSize?:number, start?:number}} [opts]
 */
export function fileHandleStream(fh, size, { chunkSize = STREAM_CHUNK_BYTES, start = 0 } = {}) {
  let pos = 0;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await fh.close().catch(() => {});
  };
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const want = Math.min(chunkSize, size - pos);
          if (want <= 0) {
            await close();
            controller.close();
            return;
          }
          const buf = Buffer.allocUnsafe(want);
          const { bytesRead } = await fh.read(buf, 0, want, start + pos);
          if (bytesRead === 0) {
            // הקובץ התקצר באמצע: מפסיקים בשגיאה כדי
            // שהלקוח יראה העברה קטועה (Content-Length לא הושלם) ולא קובץ "שלם" שגוי.
            throw new Error('input_truncated');
          }
          pos += bytesRead;
          controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead));
        } catch (err) {
          await close();
          controller.error(err);
        }
      },
      async cancel() {
        await close();
      },
    },
    { highWaterMark: 1 }
  );
}
