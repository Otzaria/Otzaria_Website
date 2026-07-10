import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import sharp from 'sharp';
import { Zip, ZipPassThrough, ZipDeflate } from 'fflate';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdmin } from '@/lib/roles';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { normalizeLineText } from '@/lib/ocr/textStandard';
import { validateLine } from '@/lib/ocr/trainingValidation';

// שם קובץ/תיקייה בטוח: אותיות עבריות/לטיניות/ספרות בלבד, השאר -> קו תחתון.
function safeName(slug) {
  return (
    String(slug || 'book')
      .replace(/[^\w֐-׿]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'book'
  );
}

function readmeText(perScript) {
  const blocks = Object.entries(perScript)
    .filter(([, s]) => s.lines > 0)
    .map(
      ([script, s]) =>
        `## ${script}  (${s.lines} שורות, ${s.rejectedCount} נפסלו)\n` +
        `python scripts/validate_manifest.py ${script}/manifest.tsv --base ${script}\n` +
        `python scripts/run_pipeline.py ${script}/manifest.tsv --base ${script} \\\n` +
        `    --script ${script} --group-segment -3 --out-dir out/${script}\n`
    );
  return (
    'מאגר תמלול שורות OCR (מאושרות בלבד) — יוצא מ-Otzaria_Website\n' +
    '===========================================================\n\n' +
    'מבנה: <script>/images/<book-slug>/p<page>/<line-id>.png  +  <script>/manifest.tsv\n' +
    'הנתיבים ב-manifest יחסיים לתיקיית הכתב, כך ש---group-segment -3 מקבץ לפי ספר\n' +
    '(מונע דליפת ספר בין train/val/test). שם המתמלל לכל שורה: <script>/contributors.tsv.\n' +
    'שורות שנפסלו באימות רשומות ב-<script>/rejected.tsv.\n\n' +
    blocks.join('\n')
  );
}

// GET: מוריד ZIP של השורות המאושרות בלבד בפורמט האימון של פרויקט ה-OCR,
// מופרד לפי סוג הכתב (square/rashi) — ההפרדה נעשית רק כאן, בייצוא.
// הייצוא זורם: כל חיתוך נוצר ונשלח בנפרד (עם backpressure), כך שהזיכרון
// אינו תלוי בגודל המאגר.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();

    const total = await OcrLine.countDocuments({ status: 'approved' });
    if (!total) {
      return NextResponse.json(
        { success: false, error: 'אין שורות מאושרות לייצוא' },
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

    // חיתוכי PNG כבר דחוסים — נכנסים כ-PassThrough; קובצי הטקסט נדחסים
    const addFile = (path, data, compress) => {
      const f = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
      zip.add(f);
      f.push(data, true);
    };

    // ה-producer רץ ברקע בזמן שהתגובה כבר זורמת ללקוח
    (async () => {
      const perScript = {
        square: { manifest: [], contributors: [], rejected: [], lines: 0, rejectedCount: 0 },
        rashi: { manifest: [], contributors: [], rejected: [], lines: 0, rejectedCount: 0 },
      };

      // מיון לפי תמונת העמוד — כל שורות אותו עמוד רצופות, ומפענחים כל תמונה פעם אחת
      const cursor = OcrLine.find({ status: 'approved' }).sort({ imagePath: 1 }).lean().cursor();

      let curPath = null;
      let curSharp = null;
      let curW = 0;
      let curH = 0;

      for await (const doc of cursor) {
        if (cancelled) return;

        // backpressure: ממתינים כשהלקוח לא מספיק לצרוך
        while (!cancelled && controllerRef.desiredSize !== null && controllerRef.desiredSize <= 0) {
          await new Promise((r) => setTimeout(r, 50));
        }

        const script = doc.scriptType === 'rashi' ? 'rashi' : 'square';
        const acc = perScript[script];

        const base = safeName(doc.bookSlug || doc.bookName);
        const fileName = `${base}/p${doc.pageNumber || 0}/${String(doc._id)}.png`;
        const relPath = `${script}/images/${fileName}`;
        const manifestPath = `images/${fileName}`;

        if (doc.imagePath !== curPath) {
          curPath = doc.imagePath;
          curSharp = null;
          curW = 0;
          curH = 0;
          try {
            const fsPath = resolveImageFsPath(doc.imagePath);
            curSharp = sharp(fsPath);
            const meta = await curSharp.metadata();
            curW = meta.width || 0;
            curH = meta.height || 0;
          } catch {
            curSharp = null;
          }
        }

        if (!curSharp) {
          acc.rejected.push(`${manifestPath}\t${(doc.text || '').replace(/\s+/g, ' ')}\tpage_image_unreadable`);
          acc.rejectedCount += 1;
          continue;
        }

        // אימות תיבה + טקסט לפי אותם כללים כמו במאגר סימון העמודים
        const v = validateLine(doc, curW, curH);
        if (!v.ok) {
          acc.rejected.push(`${manifestPath}\t${(doc.text || '').replace(/\s+/g, ' ')}\t${v.reason}`);
          acc.rejectedCount += 1;
          continue;
        }

        const left = Math.max(0, Math.round(doc.x));
        const top = Math.max(0, Math.round(doc.y));
        let width = Math.round(doc.width);
        let height = Math.round(doc.height);
        if (curW && left + width > curW) width = curW - left;
        if (curH && top + height > curH) height = curH - top;
        if (width < 1 || height < 1) {
          acc.rejected.push(`${manifestPath}\t\tcrop_clamped_empty`);
          acc.rejectedCount += 1;
          continue;
        }

        let cropBuf;
        try {
          cropBuf = await curSharp.clone().extract({ left, top, width, height }).png().toBuffer();
        } catch (e) {
          acc.rejected.push(`${manifestPath}\t\tcrop_failed:${e.message}`);
          acc.rejectedCount += 1;
          continue;
        }

        addFile(relPath, new Uint8Array(cropBuf), false);
        acc.manifest.push(`${manifestPath}\t${normalizeLineText(doc.text)}`);
        acc.contributors.push(`${manifestPath}\t${doc.transcribedByName || ''}`);
        acc.lines += 1;
      }

      if (cancelled) return;

      const enc = new TextEncoder();
      for (const [script, acc] of Object.entries(perScript)) {
        if (acc.lines === 0 && acc.rejectedCount === 0) continue;
        const header = `# Hebrew OCR training manifest (${script}) — approved lines from Otzaria_Website\n# lines: ${acc.lines}\n`;
        addFile(
          `${script}/manifest.tsv`,
          enc.encode(header + acc.manifest.join('\n') + (acc.manifest.length ? '\n' : '')),
          true
        );
        if (acc.contributors.length) {
          addFile(
            `${script}/contributors.tsv`,
            enc.encode('# image_path\ttranscriber — שם המתמלל לכל שורה\n' + acc.contributors.join('\n') + '\n'),
            true
          );
        }
        if (acc.rejected.length) {
          addFile(
            `${script}/rejected.tsv`,
            enc.encode(
              '# image_path\ttext\treason — שורות שנדחו בייצוא (לא נכללות ב-manifest)\n' +
                acc.rejected.join('\n') + '\n'
            ),
            true
          );
        }
      }

      addFile('README.txt', enc.encode(readmeText(perScript)), true);
      zip.end();
    })().catch((e) => {
      console.error('Admin OCR lines export stream error:', e);
      if (!cancelled) {
        try {
          controllerRef.error(e);
        } catch {
          // הזרם כבר נסגר
        }
      }
    });

    const filename = `ocr-lines-approved-${Date.now()}.zip`;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Admin OCR lines export error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
