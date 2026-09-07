import fs from "fs/promises";
import path from "path";
import { validateSafePath, writeText } from "./upload-paths";

// ============== Additional Tools (File-based, not for books) ==============
// כלים שאינם פועלים על תוכן ספר ב-DB אלא על קבצים בדיסק — סנכרון תיקייה מול
// גיטהאב (dictaSync). הערה: פעולות imageToHtml/ocrProcess שהיו כאן בעבר הוסרו —
// לא היה להן אף קורא בפרויקט (ראו commit).

export async function dictaSync(folderPath: string) {
  validateSafePath(folderPath);
  if (!folderPath) throw new Error("יש לבחור תיקייה תחילה");
  const baseUrl = process.env.DICTA_GITHUB_REPO || "https://raw.githubusercontent.com/zevisvei/otzaria-library/refs/heads/main/";
  const log: string[] = [];

  const listResp = await fetch(`${baseUrl}DictaToOtzaria/ספרים/לא ערוך/list.txt`);
  if (!listResp.ok) throw new Error(`שגיאה בקבלת רשימת קבצים: ${listResp.status}`);
  const listFromGithub = (await listResp.text()).split(/\r?\n/).filter(Boolean);
  log.push(`נמצאו ${listFromGithub.length} קבצים בשרת`);

  const localFiles: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".txt")) {
        localFiles.push(path.relative(folderPath, fullPath));
      }
    }
  };
  await walk(folderPath);

  const filesToDownload = listFromGithub.filter((file) => !localFiles.includes(file.replace(/\//g, path.sep)));
  for (const file of filesToDownload) {
    const filePath = path.join(folderPath, file.replace(/\//g, path.sep));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const url = `${baseUrl}DictaToOtzaria/ספרים/לא ערוך/אוצריא/${file}`;
    const r = await fetch(url);
    if (r.ok) {
      const text = await r.text();
      await writeText(filePath, text);
      log.push(`הורד: ${file}`);
    } else {
      log.push(`שגיאה בהורדה: ${file}`);
    }
  }

  const normalizedList = new Set(listFromGithub.map((f) => f.replace(/\//g, path.sep)));
  const filesToDelete = localFiles.filter((f) => !normalizedList.has(f));
  for (const file of filesToDelete) {
    const filePath = path.join(folderPath, file);
    try {
      await fs.unlink(filePath);
      log.push(`נמחק: ${file}`);
    } catch (ex: unknown) {
      const message = ex instanceof Error ? ex.message : String(ex);
      log.push(`שגיאה במחיקה: ${file} (${message})`);
    }
  }

  log.push("הסנכרון הושלם!");
  return { log };
}
