import { NextResponse } from "next/server";

// נתיב ניטור שנשמר לתאימות לפריסה; אינו תלוי בזרימת ספרי דיקטה שהוסרה.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
