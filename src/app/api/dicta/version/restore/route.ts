import { NextResponse } from "next/server";
import { VersionManager } from "../../version-manager";
import { requireBooksAccess } from "../../_auth";

export async function POST(request: Request) {
  const auth = await requireBooksAccess();
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }
  try {
    const { file_path, version_filename } = await request.json();
    if (!file_path) return NextResponse.json({ detail: "יש לבחור קובץ תחילה" }, { status: 400 });
    const vm = new VersionManager(file_path);
    await vm.init();
    const success = await vm.restoreVersionByFilename(version_filename);
    return NextResponse.json({ success });
  } catch (err: unknown) {
    console.error("dicta/version/restore error:", err);
    return NextResponse.json({ detail: "שגיאה בשחזור הגירסה" }, { status: 400 });
  }
}
