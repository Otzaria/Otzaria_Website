/**
 * טעינה נקודתית של קובץ מקור מהריפו (בלי clone ובלי הורדת DB), עם מטמון LRU לפי
 * blob sha. התוכן נשמר כבתים מאומתים; פענוח חסר-אובדן בלבד.
 */
import { createHash } from 'crypto';
import { ByteLru } from './lru.js';
import { isLossyUtf8 } from './source-text.js';

export function gitBlobShaOfBytes(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, buffer])).digest('hex');
}

let sharedCache = null;
export function getSharedSourceCache(maxBytes) {
  if (!sharedCache || sharedCache.maxBytes !== maxBytes) sharedCache = new ByteLru(maxBytes);
  return sharedCache;
}

/**
 * @param {{client:ReturnType<import('../dicta/github-api.js').createRepoClient>, ref:string, cache:ByteLru}} opts
 */
export function createGitSource({ client, ref, cache }) {
  async function loadBlob(sha) {
    const hit = cache.get(sha);
    if (hit) return hit;
    const bytes = await client.getBlob(sha);
    if (gitBlobShaOfBytes(bytes) !== sha) {
      throw Object.assign(new Error('blob integrity mismatch'), { code: 'BLOB_MISMATCH' });
    }
    const value = { content: bytes.toString('utf8'), lossy: isLossyUtf8(bytes), bytes: bytes.length };
    cache.set(sha, value, bytes.length * 3);
    return value;
  }

  return {
    async getHead() {
      const head = await client.getBranchHead(ref);
      if (!head.commitSha) throw Object.assign(new Error('branch head missing'), { status: 404 });
      return head;
    },
    async getFile(path, commitSha) {
      const cut = path.lastIndexOf('/');
      const dir = path.slice(0, cut);
      const name = path.slice(cut + 1);
      const entries = await client.listDir(dir, commitSha);
      if (!entries) return null;
      let sha = entries.find((e) => e.name === name && e.type === 'file')?.sha || null;
      if (!sha && entries.length >= 1000) sha = (await client.getFileMeta(path, commitSha))?.sha || null;
      if (!sha) return null;
      const blob = await loadBlob(sha);
      return { blobSha: sha, content: blob.content, lossy: blob.lossy };
    },
    loadBlob,
  };
}
