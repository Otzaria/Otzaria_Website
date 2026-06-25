// פירוק מזהה תוסף מה-URL לצורה <id> או <id>@<version>.
// למשל: "6a3b41de42427e3be09afcba@1.1.2" → { id, version: '1.1.2' }
//        "6a3b41de42427e3be09afcba"        → { id, version: null }
// מחזיר id רק אם הוא ObjectId תקין (24 hex), ו-version רק אם בפורמט בטוח.
// version=false מסמן שהתבקשה גרסה אך היא אינה תקינה (יש להחזיר 404).

const ID_RE = /^[a-f0-9]{24}$/i
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/

export function parsePluginRef(raw) {
  const value = (raw || '').toString().trim()
  const atIndex = value.indexOf('@')

  if (atIndex === -1) {
    return { id: ID_RE.test(value) ? value : null, version: null }
  }

  const id = value.slice(0, atIndex)
  const version = value.slice(atIndex + 1)
  return {
    id: ID_RE.test(id) ? id : null,
    // version=false: בקשה לגרסה לא-תקינה (להבדיל מ-null = ללא גרסה)
    version: VERSION_RE.test(version) && !version.includes('..') ? version : false
  }
}
