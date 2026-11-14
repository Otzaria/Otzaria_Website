// קורא גוף JSON בזרימה עם תקרת בתים. מופרד מ-NextResponse כדי לאפשר בדיקת node:test טהורה.
export async function readJsonBody(request, max) {
  const len = Number(request?.headers?.get?.('content-length'));
  if (Number.isFinite(len) && len > max) return { tooBig: true };
  const reader = request?.body?.getReader?.();
  if (!reader) return { body: null };
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel().catch(() => {});
        return { tooBig: true };
      }
      chunks.push(value);
    }
  } catch {
    return { body: null };
  }
  try {
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)) };
  } catch {
    return { body: null };
  }
}
