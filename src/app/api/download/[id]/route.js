import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getUploadBuffer } from '@/lib/gridfs-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function GET(request, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!hasBooksAccess(session?.user?.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

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
        console.error('download/[id] error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
