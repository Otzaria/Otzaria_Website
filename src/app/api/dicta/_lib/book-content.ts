import connectDB from "@/lib/db";
import DictaBook from "@/models/DictaBook";

// ============== MongoDB Book Content Functions ==============
// קריאה/כתיבה של תוכן ספר (DictaBook) במסד הנתונים — הבסיס שעליו בנויים כל
// כלי העריכה (editor-tools) הפועלים על תוכן הספר.

export async function getBookContent(bookId: string): Promise<string> {
  await connectDB();
  const book = await DictaBook.findById(bookId);
  if (!book) throw new Error("הספר לא נמצא");
  return book.content || "";
}

export async function saveBookContent(bookId: string, content: string): Promise<void> {
  await connectDB();
  const book = await DictaBook.findById(bookId);
  if (!book) throw new Error("הספר לא נמצא");
  book.content = content;
  await book.save();
}

export async function getBookLines(bookId: string): Promise<string[]> {
  const content = await getBookContent(bookId);
  return content.split(/\r?\n/);
}

export async function saveBookLines(bookId: string, lines: string[]): Promise<void> {
  await saveBookContent(bookId, lines.join("\n"));
}
