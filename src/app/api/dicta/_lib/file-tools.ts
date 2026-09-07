import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { validateSafePath, writeText } from "./upload-paths";

// ============== Additional Tools (File-based, not for books) ==============
// כלים שאינם פועלים על תוכן ספר ב-DB אלא על קבצים בדיסק (תמונות, PDF) —
// המרת תמונה ל-HTML, סנכרון תיקייה מול גיטהאב, ו-OCR באמצעות Gemini.

export async function imageToHtml(pathOrUrl: string) {
  if (!pathOrUrl) throw new Error("לא נמצאה תמונה להמרה");
  const cleaned = pathOrUrl.trim().replace(/^"|"$/g, "");
  let imgData: Buffer | null = null;
  let fileExtension = "png";

  if (fsSync.existsSync(cleaned)) {
    validateSafePath(cleaned);
    imgData = await fs.readFile(cleaned);
    fileExtension = path.extname(cleaned).replace(".", "") || "png";
  } else if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    const resp = await fetch(cleaned);
    if (!resp.ok) throw new Error("שגיאה בטעינת התמונה");
    const arr = await resp.arrayBuffer();
    imgData = Buffer.from(arr);
  } else {
    throw new Error("לא נמצאה תמונה להמרה");
  }

  if (!imgData) throw new Error("שגיאה בטעינת התמונה");
  const encoded = imgData.toString("base64");
  const html = `<img src=\"data:image/${fileExtension};base64,${encoded}\" >`;
  return { html };
}

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

type UsageData = {
  month: string;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
};

async function loadMonthlyUsage(usageFile: string): Promise<UsageData> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (fsSync.existsSync(usageFile)) {
    try {
      const raw = await fs.readFile(usageFile, "utf-8");
      const data = JSON.parse(raw);
      if (data.month !== currentMonth) return { month: currentMonth, input_tokens: 0, output_tokens: 0, total_cost: 0 };
      return data;
    } catch {
      return { month: currentMonth, input_tokens: 0, output_tokens: 0, total_cost: 0 };
    }
  }
  return { month: currentMonth, input_tokens: 0, output_tokens: 0, total_cost: 0 };
}

async function saveMonthlyUsage(usageFile: string, data: UsageData) {
  await fs.writeFile(usageFile, JSON.stringify(data, null, 2));
}

export async function ocrProcess(
  pdfPath: string,
  apiKey: string | undefined,
  model: string,
  prompt: string,
  pagesPerChunk: number,
  delaySeconds: number
) {
  if (!pdfPath) throw new Error("אנא בחר קובץ PDF תחילה");
  validateSafePath(pdfPath);
  if (!fsSync.existsSync(pdfPath)) throw new Error("קובץ PDF לא נמצא");
  const key = apiKey || process.env.GEMINI_API_KEY || "";
  if (!key) throw new Error("אנא הגדר API Key בהגדרות");

  const pdfBytes = await fs.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  let recommendedDelay = delaySeconds;
  if (model.includes("2.5-pro")) recommendedDelay = Math.max(recommendedDelay, 30);
  if (model.includes("2.5-flash")) recommendedDelay = Math.max(recommendedDelay, 6);
  if (delaySeconds < recommendedDelay) delaySeconds = recommendedDelay;

  const client = new GoogleGenerativeAI(key);
  const genModel = client.getGenerativeModel({ model });

  const allText: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let startPage = 0; startPage < totalPages; startPage += pagesPerChunk) {
    const endPage = Math.min(startPage + pagesPerChunk, totalPages);
    let retryCount = 0;
    let success = false;

    while (retryCount < 3 && !success) {
      try {
        const chunkDoc = await PDFDocument.create();
        const pages = await chunkDoc.copyPages(pdfDoc, Array.from({ length: endPage - startPage }, (_, i) => startPage + i));
        pages.forEach((page) => chunkDoc.addPage(page));
        const chunkBytes = await chunkDoc.save();

        const contents = [
          {
            role: "user",
            parts: [
              { text: prompt || "" },
              { inlineData: { data: Buffer.from(chunkBytes).toString("base64"), mimeType: "application/pdf" } },
            ],
          },
        ];

        const response = await genModel.generateContent({ contents });
        const text = response.response.text();
        allText.push(text || "");

        const usage = (response.response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
        if (usage) {
          totalInputTokens += usage.promptTokenCount ?? 0;
          totalOutputTokens += usage.candidatesTokenCount ?? 0;
        }
        success = true;
      } catch (err: unknown) {
        const errorStr = err instanceof Error ? err.message : String(err);
        if (errorStr.includes("429") || /quota|rate/i.test(errorStr)) {
          retryCount += 1;
          if (retryCount < 3) {
            await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000 * (retryCount + 1)));
          } else {
            throw new Error(`נכשל אחרי 3 נסיונות. שגיאה: ${errorStr.slice(0, 200)}`);
          }
        } else {
          throw err;
        }
      }
    }

    if (endPage < totalPages) {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }

  const outputText = allText.join("\n\n");
  const totalTokens = totalInputTokens + totalOutputTokens;

  let sessionCost = 0;
  if (model.includes("2.5-pro")) {
    sessionCost = (totalInputTokens / 1_000_000) * 1.25 + (totalOutputTokens / 1_000_000) * 5;
  } else if (model.includes("2.5-flash")) {
    sessionCost = (totalInputTokens / 1_000_000) * 0.075 + (totalOutputTokens / 1_000_000) * 0.30;
  } else if (model.includes("1.5-pro")) {
    sessionCost = (totalInputTokens / 1_000_000) * 1.25 + (totalOutputTokens / 1_000_000) * 5;
  } else {
    sessionCost = (totalInputTokens / 1_000_000) * 0.075 + (totalOutputTokens / 1_000_000) * 0.30;
  }

  const usageFile = path.join(process.cwd(), "var", "gemini_usage.json");
  await fs.mkdir(path.dirname(usageFile), { recursive: true });
  const monthly = await loadMonthlyUsage(usageFile);
  monthly.input_tokens += totalInputTokens;
  monthly.output_tokens += totalOutputTokens;
  monthly.total_cost += sessionCost;
  await saveMonthlyUsage(usageFile, monthly);

  return {
    text: outputText,
    total_pages: totalPages,
    total_tokens: totalTokens,
    session_cost: sessionCost,
    monthly,
  };
}
