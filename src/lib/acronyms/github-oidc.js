/**
 * אימות אסימון OIDC של GitHub Actions: הבקשה הגיעה מ-workflow בפורק הכינויים, בלי סוד משותף.
 * GitHub חותם על האסימון, והשרת בודק את החתימה מול המפתחות הציבוריים שלו ואת הריפו שבתוכו.
 */
import { createPublicKey, verify } from 'crypto'
import { ACRONYMS_REPO } from './fork.js'

export const OIDC_AUDIENCE = 'otzaria-acronyms-sync'
const ISSUER = 'https://token.actions.githubusercontent.com'
// מזהה קבוע של הריפו: ריפו אחר שיקבל את אותו שם (אחרי שינוי שם או מחיקה) לא יעבור
const ACRONYMS_REPO_ID = '1133669945'
const JWKS_TTL_MS = 60 * 60_000
const CLOCK_SKEW_S = 60

const jwks = (globalThis.__acronymsJwks ??= { at: 0, keys: [] })

async function keyFor(kid, fetchImpl, now) {
  let key = jwks.keys.find((k) => k.kid === kid)
  // kid לא מוכר מוריד מחדש לכל היותר פעם בדקה, כדי שבקשות מזויפות לא יציפו את GitHub
  if ((!key && now - jwks.at > 60_000) || now - jwks.at > JWKS_TTL_MS) {
    const res = await fetchImpl(`${ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`GitHub JWKS ${res.status}`)
    jwks.keys = (await res.json()).keys || []
    jwks.at = now
    key = jwks.keys.find((k) => k.kid === kid)
  }
  return key
}

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

/** @returns {Promise<{ok:true, claims:object} | {ok:false, error:string}>} */
export async function verifyActionsToken(token, { fetchImpl = fetch, now = Date.now() } = {}) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return { ok: false, error: 'not a JWT' }
  let header, claims
  try {
    header = decode(parts[0])
    claims = decode(parts[1])
  } catch {
    return { ok: false, error: 'malformed JWT' }
  }
  if (header.alg !== 'RS256') return { ok: false, error: 'unexpected alg' }

  const jwk = await keyFor(header.kid, fetchImpl, now)
  if (!jwk) return { ok: false, error: 'unknown key' }
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`)
  if (!verify('RSA-SHA256', signed, createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    return { ok: false, error: 'bad signature' }
  }

  const t = now / 1000
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (claims.iss !== ISSUER || !aud.includes(OIDC_AUDIENCE)) return { ok: false, error: 'wrong issuer or audience' }
  if (String(claims.repository_id) !== ACRONYMS_REPO_ID || claims.repository !== ACRONYMS_REPO) return { ok: false, error: 'wrong repository' }
  if (!(claims.exp > t - CLOCK_SKEW_S) || (claims.nbf && claims.nbf > t + CLOCK_SKEW_S)) return { ok: false, error: 'expired' }
  return { ok: true, claims }
}
