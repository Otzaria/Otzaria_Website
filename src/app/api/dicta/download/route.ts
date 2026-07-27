import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import fsSync from "fs";
import { validateSafePath } from "../_lib";
import { requireBooksAccess } from "../_auth";

export async function POST(request: Request) {
  const auth = await requireBooksAccess();
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }
  try {
    const { file_path } = await request.json();
    validateSafePath(file_path);
    // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/path-injection (נסגרה ידנית ב-GitHub, ראו הסבר): validateSafePath() above throws unless
    // file_path resolves inside UPLOAD_DIR, so execution only reaches here for safe paths.
    if (!file_path || !fsSync.existsSync(file_path)) {
      return NextResponse.json({ detail: "הקובץ לא נמצא" }, { status: 404 });
    }

    // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/path-injection (נסגרה ידנית ב-GitHub, ראו הסבר): see validateSafePath() call above.
    const buffer = await fs.readFile(file_path);
    const filename = path.basename(file_path);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err: unknown) {
    console.error("dicta/download error:", err);
    return NextResponse.json({ detail: "שגיאה בהורדה" }, { status: 500 });
  }
}
