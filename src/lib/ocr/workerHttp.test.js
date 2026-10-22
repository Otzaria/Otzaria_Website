// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { updateOne, connectDB } = vi.hoisted(() => ({ updateOne: vi.fn(), connectDB: vi.fn() }));
vi.mock('@/models/OcrWorkerState', () => ({ default: { updateOne } }));
vi.mock('@/lib/db', () => ({ default: connectDB }));

import { workerJson, workerError, withWorker, isJobIdParam, readJsonBody } from './workerHttp';

const SECRET = 'A'.repeat(48);
const mk = (auth) => new Request('http://x/api/worker/v1/jobs', { headers: auth ? { authorization: auth } : {} });

describe('workerHttp', () => {
  beforeEach(() => {
    updateOne.mockReset().mockResolvedValue({});
    connectDB.mockReset().mockResolvedValue();
    process.env.OCR_WORKER_SECRET = SECRET;
    process.env.OCR_WORKER_ID = 'w1';
  });

  it('workerJson/workerError: JSON ו-no-store', async () => {
    for (const r of [workerJson(200, { a: 1 }), workerError(404, 'not_found'), workerError(401, 'unauthorized'), workerError(403, 'worker_api_disabled')]) {
      expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
    expect(workerError(401, 'unauthorized').headers.get('www-authenticate')).toBe('Bearer realm="otzaria-worker"');
    expect(await workerError(409, 'x', { foo: 1 }).json()).toEqual({ foo: 1, error: 'x' });
    // כותרות נוספות (Retry-After) — בלי לדרוס content-type/no-store
    const ra = workerError(503, 'storage_unavailable', {}, { 'Retry-After': '300', 'Cache-Control': 'public' });
    expect(ra.headers.get('retry-after')).toBe('300');
    expect(ra.headers.get('cache-control')).toBe('no-store');
  });

  it('withWorker: בלי Bearer 401 JSON ובלי DB', async () => {
    const h = vi.fn();
    const r = await withWorker(h)(mk());
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'unauthorized' });
    expect(h).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('withWorker: תצורה חסרה או חלשה — 403 worker_api_disabled בלי DB', async () => {
    process.env.OCR_WORKER_SECRET = 'short';
    const weak = await withWorker(vi.fn())(mk(`Bearer short`));
    expect(weak.status).toBe(403);
    expect(await weak.json()).toEqual({ error: 'worker_api_disabled' });
    delete process.env.OCR_WORKER_SECRET;
    const r = await withWorker(vi.fn())(mk(`Bearer ${SECRET}`));
    expect(r.status).toBe(403);
    expect(r.headers.get('retry-after')).toBeNull();
    expect(connectDB).not.toHaveBeenCalled();
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ error: 'worker_api_disabled' });
  });

  it('withWorker: הצלחה — מעדכן lastSeenAt וקורא ל-handler עם params', async () => {
    const h = vi.fn(async (_r, ctx) => workerJson(200, { id: ctx.params.id, w: ctx.workerId }));
    const r = await withWorker(h)(mk(`Bearer ${SECRET}`), { params: Promise.resolve({ id: 'z' }) });
    expect(await r.json()).toEqual({ id: 'z', w: 'w1' });
    const [filter, update, opts] = updateOne.mock.calls[0];
    expect(filter).toEqual({ workerId: 'w1' });
    expect(update.$max.lastSeenAt).toBeInstanceOf(Date);
    expect(opts).toEqual({ upsert: true });
  });

  it('withWorker: כשל בעדכון lastSeenAt לא מפיל את הבקשה', async () => {
    updateOne.mockRejectedValue(new Error('db down'));
    const h = vi.fn(async () => workerJson(200, { ok: true }));
    const r = await withWorker(h)(mk(`Bearer ${SECRET}`));
    expect(r.status).toBe(200);
    expect(h).toHaveBeenCalledOnce();
  });

  it('withWorker: חריגה — 500 internal_error בלי טקסט החריגה', async () => {
    const r = await withWorker(async () => { throw new Error('פרט-פנימי'); })(mk(`Bearer ${SECRET}`));
    expect(r.status).toBe(500);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.text()).toBe('{"error":"internal_error"}');
  });

  it('withWorker: רישום החריגה מינימלי — name/code ונתיב, בלי הודעה ובלי סוד', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const err = Object.assign(new TypeError(`סוד ${SECRET} בנתיב C:\secret`), { code: 'E_TEST' });
      await withWorker(async () => { throw err; })(mk(`Bearer ${SECRET}`));
      expect(spy).toHaveBeenCalledOnce();
      const line = spy.mock.calls[0].join(' ');
      expect(line).toContain('/api/worker/v1/jobs');
      expect(line).toContain('TypeError');
      expect(line).toContain('E_TEST');
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain('סוד');
      expect(line).not.toContain('secret');
    } finally {
      spy.mockRestore();
    }
  });

  it('isJobIdParam', () => {
    expect(isJobIdParam('64b7f0c2a1b2c3d4e5f60001')).toBe(true);
    for (const v of ['64B7F0C2A1B2C3D4E5F60001', 'abc', '', undefined, '64b7f0c2a1b2c3d4e5f6000g']) expect(isJobIdParam(v)).toBe(false);
  });
  it('readJsonBody: גוף זורם גדול בלי Content-Length — 413 והזרם מבוטל לפני סופו (סקירה W06)', async () => {
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        pulled += 1;
        if (pulled > 1000) return controller.close();
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request('http://x/', { method: 'POST', body: stream, duplex: 'half' });
    expect(req.headers.get('content-length')).toBeNull();
    expect(await readJsonBody(req, 16 * 1024)).toEqual({ ok: false, status: 413, error: 'payload_too_large' });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(100);
  });

  it('readJsonBody: JSON תקין (גם עם BOM), 400 ללא-JSON/UTF-8 שבור, 413 לפי Content-Length או אחרי קריאה', async () => {
    const mkBody = (body, headers = {}) => new Request('http://x/s', { method: 'POST', body, headers });
    expect(await readJsonBody(mkBody('{"a":1}'), 100)).toEqual({ ok: true, body: { a: 1 } });
    expect(await readJsonBody(mkBody('﻿{"a":2}'), 100)).toEqual({ ok: true, body: { a: 2 } });
    for (const b of ['', 'nope', '{"a":', new Uint8Array([0x7b, 0xff, 0x7d])]) {
      expect(await readJsonBody(mkBody(b), 100)).toEqual({ ok: false, status: 400, error: 'bad_request' });
    }
    expect(await readJsonBody(mkBody('{}', { 'content-length': '101' }), 100)).toEqual({ ok: false, status: 413, error: 'payload_too_large' });
    // בלי Content-Length (זרם) — נבדק אחרי הקריאה
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('"' + 'x'.repeat(200) + '"')); c.close(); } });
    const r = new Request('http://x/s', { method: 'POST', body: stream, duplex: 'half' });
    expect(await readJsonBody(r, 100)).toEqual({ ok: false, status: 413, error: 'payload_too_large' });
  });
});
