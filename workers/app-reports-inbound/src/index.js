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
// אותן תקרות כמו בצילומי המסך של הדיווח (src/lib/app-reports/validation.js באתר)
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_TOTAL_BYTES = 15 * 1024 * 1024;
const IMAGE_MAGIC = [[0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff], [0x47, 0x49, 0x46, 0x38]];

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

const decodedSize = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

// לפי הבתים ולא לפי ה-MIME שהוצהר; האתר בודק שוב
function isImage(att) {
  if (typeof att.content !== 'string' || !att.content) return false;
  let head;
  try {
    head = atob(att.content.slice(0, 12));
  } catch {
    return false;
  }
  return IMAGE_MAGIC.some((magic) => magic.every((b, i) => head.charCodeAt(i) === b));
}

const isInline = (att) => att.disposition === 'inline' || (!att.disposition && Boolean(att.contentId));
const bareCid = (id) => String(id || '').trim().replace(/^<|>$/g, '');

/**
 * תמונות כ-base64, בתקרות: קודם המצורפות, אחר כך המוטמעות לפי מיקומן ב-HTML (התשובה החדשה למעלה).
 * מוטמעת שאינה מוצגת ב-HTML לא נשלחת. האתר מסנן את מה שבציטוט ובחתימה; attachments = מצורפים שלא נשלחו.
 */
function splitAttachments(list, html) {
  const images = [];
  let total = 0;
  let others = 0;
  const candidates = [];
  for (const att of list) {
    const image = isImage(att);
    if (!image) {
      if (!isInline(att)) others += 1;
      continue;
    }
    if (!isInline(att)) {
      candidates.push({ att, inline: false, order: -1 });
      continue;
    }
    const at = att.contentId ? html.indexOf(`cid:${bareCid(att.contentId)}`) : -1;
    if (at >= 0) candidates.push({ att, inline: true, order: at });
  }
  candidates.sort((a, b) => a.order - b.order);
  for (const { att, inline } of candidates) {
    const size = decodedSize(att.content);
    if (images.length < MAX_IMAGES && size <= MAX_IMAGE_BYTES && total + size <= MAX_IMAGES_TOTAL_BYTES) {
      total += size;
      images.push({
        fileName: att.filename || '', mimeType: att.mimeType || '', data: att.content,
        inline, ...(inline ? { contentId: bareCid(att.contentId) } : {}),
      });
    } else if (!inline) {
      others += 1;
    }
  }
  return { images, others };
}

async function buildPayload(message) {
  const raw = await new Response(message.raw).arrayBuffer();
  const email = await PostalMime.parse(raw, { attachmentEncoding: 'base64' });
  const html = (email.html || '').slice(0, MAX_TEXT_CHARS);
  const { images, others } = splitAttachments(email.attachments || [], html);
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
    // האתר צריך את ה-HTML גם כשיש טקסט, כדי לדעת אילו תמונות מוטמעות שייכות לתשובה החדשה
    html: !email.text || images.some((img) => img.inline) ? html : '',
    headers,
    attachments: others,
    images,
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
