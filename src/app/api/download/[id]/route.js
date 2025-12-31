import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        await connectDB();

        const upload = await Upload.findById(id);
        if (!upload) return NextResponse.json({ error: 'File not found' }, { status: 404 });

        // החזרת הקובץ
        return new NextResponse(upload.content, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(upload.originalFileName)}"`
            }
        });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}