import { NextResponse } from "next/server";
import { VersionManager } from "../../version-manager";
import { requireBooksAccess } from "../../_auth";

export async function POST(request: Request) {
  const auth = await requireBooksAccess();
  if (!auth.ok) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }
  try {
    const { file_path } = await request.json();
    if (!file_path) return NextResponse.json({ detail: "יש לבחור קובץ תחילה" }, { status: 400 });
    const vm = new VersionManager(file_path);
    await vm.init();
    const versions = vm.getAllVersions().map((v) => ({
      version_id: `v${v.version}`,
      description: v.description,
      timestamp: v.timestamp,
      filename: v.filename,
      size: v.size,
    }));
    return NextResponse.json({
      current: vm.getCurrentVersion(),
      versions,
      count: vm.getVersionCount(),
    });
  } catch (err: unknown) {
    console.error("dicta/version/list error:", err);
    return NextResponse.json({ detail: "שגיאה בטעינת הגירסאות" }, { status: 400 });
  }
}
