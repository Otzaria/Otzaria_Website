import { NextResponse } from "next/server";
import { VersionManager } from "../../version-manager";
import { requireBooksAccess } from "../../_auth";

export async function POST(request: Request) {
  const auth = await requireBooksAccess();
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }
  try {
    const { file_path, description } = await request.json();
    if (!file_path) return NextResponse.json({ detail: "יש לבחור קובץ תחילה" }, { status: 400 });
    const vm = new VersionManager(file_path);
    await vm.init();
    const versionNum = await vm.saveVersion(description || "");
    if (!versionNum) return NextResponse.json({ detail: "לא ניתן לשמור גירסה" }, { status: 400 });
    return NextResponse.json({ version: versionNum });
  } catch (err: unknown) {
    console.error("dicta/version/create error:", err);
    return NextResponse.json({ detail: "שגיאה בשמירת הגירסה" }, { status: 400 });
  }
}
