import fs from "fs/promises";
import path from "path";

// ============== Upload directory / safe-path handling ==============
// כל קובץ שמועלה/נשמר על ידי כלי הדיקטה (PDF להעלאה, תמונות ל-OCR וכו') חייב
// לעבור דרך validateSafePath כדי למנוע גישה מחוץ לתיקיית ההעלאות המורשית.

export const UPLOAD_DIR = path.join(process.cwd(), "var", "dicta-uploads");

export function validateSafePath(filePath: string) {
  if (!filePath) throw new Error("נא לבחור קובץ תחילה");
  const resolvedPath = path.resolve(filePath);
  const resolvedUploadDir = path.resolve(UPLOAD_DIR);
  if (!resolvedPath.startsWith(resolvedUploadDir + path.sep) && resolvedPath !== resolvedUploadDir) {
    throw new Error("גישה נדחתה: ניסיון גישה מחוץ לתיקייה המורשית");
  }
}

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function writeText(filePath: string, content: string) {
  validateSafePath(filePath);
  await fs.writeFile(filePath, content, "utf-8");
}
