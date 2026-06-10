import { NextResponse } from "next/server";
import fs from "fs/promises";
import { validateSafePath } from "../../_lib";
import { requireBooksAccess } from "../../_auth";

export async function POST(request: Request) {
  const auth = await requireBooksAccess();
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }
  try {
    const { file_path, content } = await request.json();
    if (!file_path) {
      return NextResponse.json({ detail: "חסר נתיב קובץ" }, { status: 400 });
    }
    validateSafePath(file_path);
    await fs.writeFile(file_path, content ?? "", "utf-8");
    return NextResponse.json({ saved: true });
  } catch (err: unknown) {
    console.error("dicta/file/write error:", err);
    return NextResponse.json({ detail: "שגיאה בכתיבת הקובץ" }, { status: 500 });
  }
}
