import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getUploadBuffer } from '@/lib/gridfs-service';

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        await connectDB();

        const upload = await Upload.findById(id);
        if (!upload) return NextResponse.json({ error: 'File not found' }, { status: 404 });

        const fileBuffer = await getUploadBuffer(upload);

        // החזרת הקובץ
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(upload.originalFileName)}"`
            }
        });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
