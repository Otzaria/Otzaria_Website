import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
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

// README עם פקודות ההרצה המדויקות בפרויקט OCR-AI.
function readmeText(perScript) {
  const blocks = Object.entries(perScript)
    .filter(([, s]) => s.lines > 0)
    .map(
      ([script, s]) =>
        `## ${script}  (${s.lines} שורות, ${s.rejected} נפסלו)\n` +
        `python scripts/validate_manifest.py ${script}/manifest.tsv --base ${script}\n` +
        `python scripts/run_pipeline.py ${script}/manifest.tsv --base ${script} \\\n` +
        `    --script ${script} --group-segment -3 --out-dir out/${script}\n`
    );
  return (
    'מאגר אימון OCR — יוצא מ-Otzaria_Website\n' +
    '=======================================\n\n' +
    'מבנה: <script>/images/<book-slug>/p<page>/l<NN>.png  +  <script>/manifest.tsv\n' +
    'הנתיבים ב-manifest יחסיים לתיקיית הכתב, כך ש---group-segment -3 מקבץ לפי ספר\n' +
    '(מונע דליפת ספר בין train/val/test). שורות שנפסלו רשומות ב-<script>/rejected.tsv.\n\n' +
    blocks.join('\n')
  );
}

// GET: מוריד ZIP בפורמט האימון של הפרויקט, מופרד לפי סוג כתב (square/rashi).
// לכל כתב: manifest.tsv + images/<slug>/p<page>/l<NN>.png. טקסט מנורמל; שורות עם
// תווים מחוץ לאלפבית או תיבה פסולה נדחות ונרשמות ב-rejected.tsv.
// פרמטרים: ?status=completed  (ברירת מחדל: כל עמוד עם שורות תקינות)
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    const query = {};
    if (statusFilter) query.status = statusFilter;

    const docs = await OcrTrainingPage.find(query).sort({ scriptType: 1, bookName: 1, pageNumber: 1 }).lean();

    const files = {};
    // מצטבר לכל כתב: שורות manifest, שורות שנדחו, ומונים
    const perScript = {
      square: { manifest: [], rejected: [], lines: 0, rejectedCount: 0 },
      rashi: { manifest: [], rejected: [], lines: 0, rejectedCount: 0 },
    };
    let skippedPages = 0;

    for (const doc of docs) {
      const script = doc.scriptType === 'rashi' ? 'rashi' : 'square';
      const acc = perScript[script];

      let fsPath;
      try {
        fsPath = resolveImageFsPath(doc.imagePath);
      } catch {
        skippedPages += 1;
        continue;
      }

      // מקור החיתוך: אם יש סיבוב, מסובבים תחילה את המקור באותה זווית (עם רקע לבן),
      // כך שהחיתוך תואם בדיוק למה שהמשתמש ראה. מידות ה"בד" נלקחות מהתמונה המסובבת.
      const rotation = Number(doc.rotation) || 0;
      let cropW = 0;
      let cropH = 0;
      // אובייקט sharp אחד לעמוד; כל חיתוך משתמש ב-clone() כדי לא לפענח את התמונה מחדש לכל שורה
      let pageSharp;
      try {
        if (rotation) {
          const rotatedBuf = await sharp(fsPath)
            .rotate(rotation, { background: '#ffffff' })
            .png()
            .toBuffer();
          pageSharp = sharp(rotatedBuf);
          const rmeta = await pageSharp.metadata();
          cropW = rmeta.width || 0;
          cropH = rmeta.height || 0;
        } else {
          pageSharp = sharp(fsPath);
          const meta = await pageSharp.metadata();
          cropW = meta.width || 0;
          cropH = meta.height || 0;
        }
      } catch {
        skippedPages += 1;
        continue;
      }
      const imgW = cropW;
      const imgH = cropH;

      const base = safeName(doc.bookSlug || doc.bookName);

      for (const line of doc.lines || []) {
        const idx = Number.isInteger(line.index) ? line.index + 1 : acc.lines + 1;
        const relPath = `${script}/images/${base}/p${doc.pageNumber}/l${String(idx).padStart(2, '0')}.png`;
        const manifestPath = `images/${base}/p${doc.pageNumber}/l${String(idx).padStart(2, '0')}.png`;

        // אימות תיבה + טקסט לפי אותם כללים כמו בהשלמה
        const v = validateLine(line, imgW, imgH);
        if (!v.ok) {
          acc.rejected.push(`${manifestPath}\t${(line.text || '').replace(/\s+/g, ' ')}\t${v.reason}`);
          acc.rejectedCount += 1;
          continue;
        }

        // חיתוך בפועל (מקוטם לגבולות התמונה מטעמי בטיחות)
        const left = Math.max(0, Math.round(line.x));
        const top = Math.max(0, Math.round(line.y));
        let width = Math.round(line.width);
        let height = Math.round(line.height);
        if (imgW && left + width > imgW) width = imgW - left;
        if (imgH && top + height > imgH) height = imgH - top;
        if (width < 1 || height < 1) {
          acc.rejected.push(`${manifestPath}\t\tcrop_clamped_empty`);
          acc.rejectedCount += 1;
          continue;
        }

        let cropBuf;
        try {
          cropBuf = await pageSharp.clone().extract({ left, top, width, height }).png().toBuffer();
        } catch (e) {
          acc.rejected.push(`${manifestPath}\t\tcrop_failed:${e.message}`);
          acc.rejectedCount += 1;
          continue;
        }

        files[relPath] = new Uint8Array(cropBuf);
        acc.manifest.push(`${manifestPath}\t${normalizeLineText(line.text)}`);
        acc.lines += 1;
      }
    }

    const totalLines = perScript.square.lines + perScript.rashi.lines;
    if (totalLines === 0) {
      return NextResponse.json(
        { success: false, error: 'אין שורות תקינות עם טקסט לייצוא' },
        { status: 404 }
      );
    }

    // כתיבת manifest + rejected לכל כתב שיש בו תוכן
    const summaryForReadme = {};
    for (const [script, acc] of Object.entries(perScript)) {
      summaryForReadme[script] = { lines: acc.lines, rejected: acc.rejectedCount };
      if (acc.lines === 0 && acc.rejectedCount === 0) continue;
      const header = `# Hebrew OCR training manifest (${script}) — from Otzaria_Website\n# lines: ${acc.lines}\n`;
      files[`${script}/manifest.tsv`] = new TextEncoder().encode(
        header + acc.manifest.join('\n') + (acc.manifest.length ? '\n' : '')
      );
      if (acc.rejected.length) {
        files[`${script}/rejected.tsv`] = new TextEncoder().encode(
          '# image_path\ttext\treason — שורות שנדחו בייצוא (לא נכללות ב-manifest)\n' +
            acc.rejected.join('\n') + '\n'
        );
      }
    }

    files['README.txt'] = new TextEncoder().encode(readmeText(summaryForReadme));

    const zipped = zipSync(files, { level: 6 });
    const filename = `ocr-training-${Date.now()}.zip`;
    const totalRejected = perScript.square.rejectedCount + perScript.rashi.rejectedCount;

    return new NextResponse(Buffer.from(zipped), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipped.length),
        'X-Skipped-Pages': String(skippedPages),
        'X-Rejected-Lines': String(totalRejected),
        'X-Lines-Square': String(perScript.square.lines),
        'X-Lines-Rashi': String(perScript.rashi.lines),
      },
    });
  } catch (error) {
    console.error('OCR training export error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
