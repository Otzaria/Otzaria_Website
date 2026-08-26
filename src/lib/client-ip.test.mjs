import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getClientIp } from './client-ip.js';

// עוזר: Request אמיתי עם כותרות — כך נבדק גם הנתיב headers.get() וגם ה-fallback
// לאובייקט headers רגיל.
function reqWith(headersObject) {
  return new Request('https://otzaria.org/api/test', {
    method: 'GET',
    headers: headersObject,
  });
}

// עוזר: הצבת/שחזור בטוחים של TRUSTED_PROXY_COUNT
function withTrustedCount(value, fn) {
  const prev = process.env.TRUSTED_PROXY_COUNT;
  if (value === undefined) delete process.env.TRUSTED_PROXY_COUNT;
  else process.env.TRUSTED_PROXY_COUNT = String(value);
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TRUSTED_PROXY_COUNT;
    else process.env.TRUSTED_PROXY_COUNT = prev;
  }
}

// ==================== T = 0 (ברירת המחדל הבטוחה) ====================

test('ברירת המחדל T=0: רק request.ip; XFF מזויף מנוטרל לחלוטין', () => {
  const req = reqWith({ 'x-forwarded-for': '6.6.6.6' });
  assert.equal(getClientIp(Object.assign(req, { ip: '9.9.9.9' })), '9.9.9.9');
});

test('ברירת המחדל T=0: בלי request.ip -> unknown גם כש-XFF קיים', () => {
  assert.equal(getClientIp(reqWith({ 'x-forwarded-for': '6.6.6.6' })), 'unknown');
});

test('T=0 explicit: גם x-real-ip מנוטרל (header נשלט-לקוח בחשיפה ישירה)', () => {
  const req = reqWith({ 'x-real-ip': '6.6.6.6' });
  const ip = withTrustedCount(0, () =>
    getClientIp(Object.assign(req, { ip: '9.9.9.9' }))
  );
  assert.equal(ip, '9.9.9.9');
});

test('T=0: peer loopback/פרטי מוחזר כמות שהוא (bucket מקומי משותף, לא bypass)', () => {
  const req = reqWith({});
  assert.equal(getClientIp(Object.assign(req, { ip: '127.0.0.1' })), '127.0.0.1');
});

// ==================== T > 0 ====================

test('T=1: נבחר בדיוק האלמנט האחרון; req.ip ציבורית (ה-proxy) אינו מועדף', () => {
  // Regression לממצא 1: peer ציבורי של ה-proxy לא מאחד את כל המשתמשים
  const req = reqWith({ 'x-forwarded-for': '203.0.113.5' });
  const ip = withTrustedCount(1, () =>
    getClientIp(Object.assign(req, { ip: '198.51.100.1' })) // ה-proxy עצמו
  );
  assert.equal(ip, '203.0.113.5');
});

test('T=1: ה-exploit של דילוג-שמאלה — הלקוח מזריק 6.6.6.6 וה-proxy מצרף 10.0.0.5', () => {
  // Regression לממצא 2: הקוד הקודם היה מדלג מעל 10.0.0.5 ומחזיר את 6.6.6.6
  // בשליטת הלקוח (עקיפת rate-limit). המודל הנוכחי מחזיר את האלמנט הנבחר
  // כמות שהוא — בלי לחצות את גבול האמון.
  const ip = withTrustedCount(1, () =>
    getClientIp(reqWith({ 'x-forwarded-for': '6.6.6.6, 10.0.0.5' }))
  );
  assert.equal(ip, '10.0.0.5');
});

test('T=2: שרשרת [client, proxy1] תקנית — נלקח השני מהסוף', () => {
  const ip = withTrustedCount(2, () =>
    getClientIp(reqWith({ 'x-forwarded-for': '198.51.100.7, 10.0.0.2' }))
  );
  assert.equal(ip, '198.51.100.7');
});

test('T=2: שרשרת קצרה מצפי (פנייה ישירה עם XFF מזויף) — אין כרייה שמאלה;', () => {
  // bucket = ה-peer האמיתי משכבת ה-socket (ה-IP האמיתי של התוקף), לא הערך שהזריק
  const req = reqWith({ 'x-forwarded-for': '9.9.9.9' });
  const ip = withTrustedCount(2, () =>
    getClientIp(Object.assign(req, { ip: '203.0.113.99' }))
  );
  assert.equal(ip, '203.0.113.99');
});

test('T=2: שרשרת קצרה + x-real-ip ש-ingress מציב (nginx x-real-ip-only) -> x-real-ip', () => {
  const ip = withTrustedCount(2, () =>
    getClientIp(reqWith({ 'x-forwarded-for': 'junk', 'x-real-ip': '198.51.100.3' }))
  );
  assert.equal(ip, '198.51.100.3');
});

test('T>0 ושרשרת קצרה ללא שום fallback -> unknown (fail-closed)', () => {
  assert.equal(
    withTrustedCount(3, () => getClientIp(reqWith({}))),
    'unknown'
  );
});

// ==================== normalization / קלט env / פורמט headers ====================

test('ערך env לא-תקין מתאפס ל-T=0 (בטוח): XFF מנוטרל', () => {
  const req = reqWith({ 'x-forwarded-for': '1.2.3.4' });
  const ip = withTrustedCount('banana', () =>
    getClientIp(Object.assign(req, { ip: '5.5.5.5' }))
  );
  assert.equal(ip, '5.5.5.5');
});

test('XFF עם רווחים מנורמל (T=1)', () => {
  const ip = withTrustedCount(1, () =>
    getClientIp(reqWith({ 'x-forwarded-for': '10.0.0.1 , 203.0.113.9 ' }))
  );
  assert.equal(ip, '203.0.113.9');
});

test('fallback לאובייקט headers רגיל בלי get() (דפוס [...nextauth]) תחת T=1', () => {
  const fake = { headers: { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' } };
  assert.equal(withTrustedCount(1, () => getClientIp(fake)), '1.1.1.1');
});

test('headers.get כפונקציה תחת T=1', () => {
  const fake = { headers: { get: (n) => (n === 'x-forwarded-for' ? '7.7.7.7' : null) } };
  assert.equal(withTrustedCount(1, () => getClientIp(fake)), '7.7.7.7');
});

