import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; 
import { hasBookLibraryAccess } from '@/lib/roles';

const CONFIG_KEY = 'global_editor_instructions';

export async function GET() {
  try {
    await connectDB();

    const config = await SystemConfig.findOne({ key: CONFIG_KEY }).lean();
    const instructions = config?.value || { sections: [] };

    return NextResponse.json({
      success: true,
      instructions: instructions
    });

  } catch (error) {
    console.error('Error fetching global instructions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch instructions' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBookLibraryAccess(session.user?.role)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();
    
    const body = await request.json();
    const { instructions } = body;

    if (!instructions || !Array.isArray(instructions.sections)) {
      return NextResponse.json(
        { success: false, error: 'Invalid data format' },
        { status: 400 }
      );
    }

    const updatedConfig = await SystemConfig.findOneAndUpdate(
      { key: CONFIG_KEY },
      { 
        $set: { 
          value: instructions,
          label: 'הנחיות עריכה גלובליות'
        } 
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      success: true,
      instructions: updatedConfig.value
    });

  } catch (error) {
    console.error('Error saving global instructions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save instructions' },
      { status: 500 }
    );
  }
}