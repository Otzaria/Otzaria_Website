import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { hasBooksAccess } from "@/lib/roles";

type SessionUser = { id?: string; _id?: string; role?: string };

type AuthResult =
  | { ok: true; session: { user: SessionUser } }
  | { ok: false; status: number; error: string };

/**
 * מאמת שהמשתמש מחובר ובעל הרשאת ניהול ספרים.
 * נתיבי ה-dicta מבצעים פעולות קובץ/גירסה בצד השרת ולכן מוגבלים למנהלי ספרים.
 */
export async function requireBooksAccess(): Promise<AuthResult> {
  // authOptions מוגדר ב-JS ואינו ממוטפס במלואו; ההמרה מונעת אזהרת טיפוס.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (await getServerSession(authOptions as any)) as
    | { user?: SessionUser }
    | null;

  if (!session?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!hasBooksAccess(session.user.role)) {
    return { ok: false, status: 403, error: "אין הרשאה לבצע פעולה זו" };
  }
  return { ok: true, session: { user: session.user } };
}
