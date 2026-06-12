import { NextResponse } from "next/server";
import path from "path";
import { ensureUploadDir, UPLOAD_DIR } from "../_lib";
import { requireBooksAccess } from "../_auth";
import fs from "fs/promises";

export async function POST(request: Request) {
  const auth = await requireBooksAccess();
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ detail: "חסר קובץ" }, { status: 400 });
    }

    await ensureUploadDir();
    // נטרול שם הקובץ: שמירה רק על שם הבסיס וצמצום לתווים בטוחים בלבד.
    const baseName = path.basename(file.name);
    const safeName = baseName.replace(/[^a-zA-Z0-9._֐-׿-]/g, "_").replace(/\.{2,}/g, ".");
    const destName = `${Date.now()}_${safeName || "file"}`;
    const destPath = path.join(UPLOAD_DIR, destName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(destPath, buffer);

    return NextResponse.json({ path: destPath, name: file.name });
  } catch (err: unknown) {
    console.error("dicta/upload error:", err);
    return NextResponse.json({ detail: "שגיאה בשמירת הקובץ" }, { status: 500 });
  }
}
