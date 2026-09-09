import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { hasBooksAccess } from "@/lib/roles";
import { unauthorized, forbidden } from "@/lib/apiResponse";

type SessionUser = { id?: string; _id?: string; role?: string };

type AuthResult =
  | { ok: true; session: { user: SessionUser } }
  | { ok: false; status: number; error: string };

type ForbiddenAuthResult =
  | { ok: true; session: { user: SessionUser } }
  | { ok: false; response: ReturnType<typeof NextResponse.json> };

async function getBooksSession() {
  // authOptions מוגדר ב-JS ואינו ממוטפס במלואו; ההמרה מונעת אזהרת טיפוס.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await getServerSession(authOptions as any)) as
    | { user?: SessionUser }
    | null;
}

/**
 * מאמת שהמשתמש מחובר ובעל הרשאת ניהול ספרים.
 * נתיבי ה-dicta מבצעים פעולות קובץ/גירסה בצד השרת ולכן מוגבלים למנהלי ספרים.
 */
export async function requireBooksAccess(): Promise<AuthResult> {
  const session = await getBooksSession();

  if (!session?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!hasBooksAccess(session.user.role)) {
    return { ok: false, status: 403, error: "אין הרשאה לבצע פעולה זו" };
  }
  return { ok: true, session: { user: session.user } };
}

/**
 * גרסה שקולה ל-requireBooksAccess() עבור נתיבים שנוח להם לקבל NextResponse
 * מוכן ישירות (auth.response) במקום status+error גולמיים. בעבר קיפלה תמיד
 * ל-403 ("Forbidden: Admin access required") גם כשאין session בכלל — תוקן
 * להבחין נכון בין 401 (אין session) ל-403 (יש session, אין הרשאה), כמו
 * requireBooksAccess ו-requireAccess הגנרי ב-src/lib/apiResponse.ts.
 */
export async function requireBooksAccessOrForbidden(): Promise<ForbiddenAuthResult> {
  const session = await getBooksSession();

  if (!session?.user) {
    return { ok: false, response: unauthorized() };
  }
  if (!hasBooksAccess(session.user.role)) {
    return { ok: false, response: forbidden() };
  }
  return { ok: true, session: { user: session.user } };
}
