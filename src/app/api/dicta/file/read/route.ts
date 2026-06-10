import { NextResponse } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import { validateSafePath } from "../../_lib";
import { requireBooksAccess } from "../../_auth";

export async function POST(request: Request) {
  const auth = await requireBooksAccess();
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }
  try {
    const { file_path } = await request.json();
    validateSafePath(file_path);
    if (!file_path || !fsSync.existsSync(file_path)) {
      return NextResponse.json({ detail: "הקובץ לא נמצא" }, { status: 404 });
    }
    const content = await fs.readFile(file_path, "utf-8");
    return NextResponse.json({ content });
  } catch (err: unknown) {
    console.error("dicta/file/read error:", err);
    return NextResponse.json({ detail: "שגיאה בקריאת הקובץ" }, { status: 500 });
  }
}
