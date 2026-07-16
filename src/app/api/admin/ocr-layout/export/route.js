import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { Zip, ZipDeflate } from 'fflate';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasOcrAccess } from '@/lib/roles';

// ממיר תשובות משימה לשדות שורת-הייצוא. zones-full מקופל לאותם שדות —
// פרויקט ה-OCR רואה פורמט אחיד בלי קשר לצורת המסך שבה נענתה השאלה.
function foldTasksToRecord(tasks) {
  const rec = {};
  const apply = (kind, answer) => {
    if (!answer) return;
    if (kind === 'pagenum') {
      rec.pagenum = { value: answer.value ?? null };
      // שומר-דף (D019): apply_template הופך את ההחרגה ל-kind catchword
      if (answer.catchword === true) rec.pagenum.catchword = true;
    }
    else if (kind === 'header') rec.header = { box: answer.box ?? null };
    else if (kind === 'streams') {
      rec.streams = (answer.bands || []).map((b) => ({
        y0: b.y0,
        y1: b.y1,
        book_stream: b.book_stream ?? null,
      }));
    }
  };
  for (const t of tasks || []) {
    if (t.kind === 'zones-full') {
      for (const k of ['pagenum', 'header', 'streams']) apply(k, t.answer?.[k]);
    } else {
      apply(t.kind, t.answer);
    }
  }
  return rec;
}

// GET: מוריד ZIP של הכרעות-האדם המאושרות בלבד, בפורמט שפרויקט ה-OCR צורך
// ישירות: <edition>.human.jsonl — שורה לעמוד:
//   {page, pagenum:{value|null}, header:{box|null}, streams:[{y0,y1,book_stream}], by, at}
// (שדה שאין לו משימה בעמוד — מושמט). בנוסף contributors.tsv — שם המתייג
// לכל עמוד. הייצוא זורם עם cursor + backpressure כמו בייצוא ocr-lines.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasOcrAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();

    const total = await OcrLayoutPage.countDocuments({ status: 'approved' });
    if (!total) {
      return NextResponse.json(
        { success: false, error: 'אין עמודים מאושרים לייצוא' },
        { status: 404 }
      );
    }

    let controllerRef;
    let cancelled = false;
    const body = new ReadableStream({
      start(c) {
        controllerRef = c;
      },
      cancel() {
        cancelled = true;
      },
    });

    const zip = new Zip((err, chunk, final) => {
      if (cancelled) return;
      try {
        if (err) controllerRef.error(err);
        else {
          controllerRef.enqueue(chunk);
          if (final) controllerRef.close();
        }
      } catch {
        cancelled = true;
      }
    });

    const enc = new TextEncoder();
    const addFile = (path, text) => {
      const f = new ZipDeflate(path, { level: 6 });
      zip.add(f);
      f.push(enc.encode(text), true);
    };

    // ה-producer רץ ברקע בזמן שהתגובה כבר זורמת ללקוח. המיון לפי מהדורה —
    // קובץ לכל מהדורה נסגר ונשלח ברגע שהסמן עובר למהדורה הבאה, כך שהזיכרון
    // חסום בגודל מהדורה אחת (שורות JSONL קצרות).
    (async () => {
      const cursor = OcrLayoutPage.find({ status: 'approved' })
        .sort({ edition: 1, pageStem: 1 })
        .lean()
        .cursor();

      const contributors = [];
      let curEdition = null;
      let curLines = [];
      const flushEdition = () => {
        if (curEdition && curLines.length) {
          addFile(`${curEdition}.human.jsonl`, curLines.join('\n') + '\n');
        }
        curLines = [];
      };

      for await (const doc of cursor) {
        if (cancelled) return;

        // backpressure: ממתינים כשהלקוח לא מספיק לצרוך
        while (!cancelled && controllerRef.desiredSize !== null && controllerRef.desiredSize <= 0) {
          await new Promise((r) => setTimeout(r, 50));
        }

        if (doc.edition !== curEdition) {
          flushEdition();
          curEdition = doc.edition;
        }

        const rec = {
          page: doc.pageStem,
          ...foldTasksToRecord(doc.tasks),
          by: doc.answeredByName || '',
          at: doc.answeredAt ? new Date(doc.answeredAt).toISOString() : null,
        };
        curLines.push(JSON.stringify(rec));
        contributors.push(`${doc.edition}/${doc.pageStem}\t${doc.answeredByName || ''}`);
      }

      if (cancelled) return;
      flushEdition();

      addFile(
        'contributors.tsv',
        '# edition/page\tanswered_by — שם המתייג לכל עמוד\n' + contributors.join('\n') + '\n'
      );
      addFile(
        'README.txt',
        'הכרעות-אדם לתיוג מבנה-עמוד (מאושרות בלבד) — יוצא מ-Otzaria_Website\n' +
          '=================================================================\n\n' +
          'קובץ לכל מהדורה: <edition>.human.jsonl — שורה לעמוד:\n' +
          '{page, pagenum:{value|null, catchword?}, header:{box|null}, streams:[{y0,y1,book_stream}], by, at}\n' +
          'שדה חסר = לא הייתה משימה כזו בעמוד. pagenum.catchword=true = החיתוך\n' +
          'מציג שומר-דף (מילה מהעמוד הבא), לא מספר (D019).\n' +
          'תיבות בפיקסלים של תמונת העמוד שהאצווה הצביעה עליה (אצוות ZIP —\n' +
          'התמונה המיושרת; אצוות-קישור — סריקת הספר המקורית); רצועות זרמים\n' +
          'מנורמלות (0..1) לגובה העמוד.\n\n' +
          'צריכה בפרויקט ה-OCR:\n' +
          'python scripts/apply_template.py --editions <ed> --human <תיקיית הקבצים>\n'
      );
      zip.end();
    })().catch((e) => {
      console.error('Admin OCR layout export stream error:', e);
      if (!cancelled) {
        try {
          controllerRef.error(e);
        } catch {
          // הזרם כבר נסגר
        }
      }
    });

    const filename = `ocr-layout-human-${Date.now()}.zip`;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Admin OCR layout export error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
