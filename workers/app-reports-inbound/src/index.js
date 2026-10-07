/**
 * Email Worker: תשובות של מדווחים (reply+<טוקן>@reply.otzaria.org) → האתר.
 *
 * המייל מפוענח כאן (postal-mime) ונשלח כ-JSON ל-POST /api/app-reports/inbound-email.
 * חוזה הסטטוסים (src/lib/app-reports/inbound-handler.js באתר):
 *   2xx           — נקלט (או כפול / מענה אוטומטי). סיום.
 *   404/413/422   — קבוע (טוקן לא מוכר, גדול מדי). המייל מועבר ל-FALLBACK_TO כדי שאדם יראה אותו.
 *   כל השאר       — זמני (כולל 503 של חסימת השבת באתר). נשמר ב-KV ונשלח שוב מה-cron של ה-Worker.
 */
import PostalMime from 'postal-mime';

const MAX_RAW_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 200000;
const PENDING_TTL_SECONDS = 14 * 24 * 60 * 60;
const RETRY_BATCH = 50;
const PERMANENT = new Set([404, 413, 422]);
const REPLY_RE = /^reply\+[0-9a-f]{40}@/i;
const HEADERS = ['auto-submitted', 'precedence', 'x-autoreply', 'x-autorespond', 'x-auto-response-suppress'];

async function forwardToHuman(message, env, reason) {
  if (!env.FALLBACK_TO) {
    console.error(`No FALLBACK_TO; dropping (${reason})`);
    return;
  }
  try {
    await message.forward(env.FALLBACK_TO);
  } catch (err) {
    console.error(`Forward failed (${reason}):`, err?.message);
  }
}

async function buildPayload(message) {
  const raw = await new Response(message.raw).arrayBuffer();
  const email = await PostalMime.parse(raw);
  const headers = {};
  for (const name of HEADERS) {
    const value = message.headers.get(name);
    if (value) headers[name] = value;
  }
  return {
    to: message.to,
    from: message.from,
    subject: email.subject || '',
    messageId: email.messageId || message.headers.get('message-id') || null,
    text: (email.text || '').slice(0, MAX_TEXT_CHARS),
    html: email.text ? '' : (email.html || '').slice(0, MAX_TEXT_CHARS),
    headers,
    attachments: (email.attachments || []).filter((a) => a.disposition !== 'inline').length,
    receivedAt: new Date().toISOString(),
  };
}

/** @returns {Promise<'ok'|'permanent'|'retry'>} */
async function deliver(payload, env) {
  let res;
  try {
    res = await fetch(`${env.SITE_URL.replace(/\/+$/, '')}/api/app-reports/inbound-email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.INBOUND_SECRET}`,
        // ה-proxy של האתר אינו חוסם בוטים בשבת; ה-Worker אינו בוט ורוצה לקבל 503 ולנסות שוב
        'user-agent': 'otzaria-app-reports-inbound',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Site unreachable:', err?.message);
    return 'retry';
  }
  if (res.ok) return 'ok';
  if (PERMANENT.has(res.status)) return 'permanent';
  console.error(`Site answered ${res.status}; will retry`);
  return 'retry';
}

const pendingKey = (payload) => `pending:${payload.receivedAt}:${crypto.randomUUID()}`;

const worker = {
  async email(message, env) {
    if (!REPLY_RE.test(message.to) || message.rawSize > MAX_RAW_BYTES) {
      await forwardToHuman(message, env, 'not a reply address or too large');
      return;
    }
    let payload;
    try {
      payload = await buildPayload(message);
    } catch (err) {
      console.error('Parse failed:', err?.message);
      await forwardToHuman(message, env, 'parse failed');
      return;
    }
    const result = await deliver(payload, env);
    if (result === 'retry') {
      await env.PENDING.put(pendingKey(payload), JSON.stringify(payload), { expirationTtl: PENDING_TTL_SECONDS });
    } else if (result === 'permanent') {
      await forwardToHuman(message, env, 'rejected by site');
    }
  },

  // ניסיון חוזר לתשובות שהאתר לא קיבל (שבת, תקלה). כפילות לא מזיקה — האתר מסנן לפי Message-ID.
  async scheduled(_event, env) {
    const { keys } = await env.PENDING.list({ prefix: 'pending:', limit: RETRY_BATCH });
    for (const { name } of keys) {
      const payload = await env.PENDING.get(name, 'json');
      if (!payload) continue;
      const result = await deliver(payload, env);
      if (result === 'ok') {
        await env.PENDING.delete(name);
      } else if (result === 'permanent') {
        // המייל המקורי כבר אינו זמין להעברה; נשאר ב-KV עד התפוגה לבדיקה ידנית
        await env.PENDING.put(name.replace(/^pending:/, 'failed:'), JSON.stringify(payload), { expirationTtl: PENDING_TTL_SECONDS });
        await env.PENDING.delete(name);
      } else {
        break; // האתר עדיין לא זמין — אין טעם להמשיך בריצה הזו
      }
    }
  },
};

export default worker;
