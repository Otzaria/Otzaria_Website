import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { serverError } from '@/lib/apiResponse';

export async function GET() {
  try {
    await connectDB();

    const config = await SystemConfig.findOne({ key: 'global_editor_instructions' }).lean();

    const defaultInstructions = {
      sections: [
        {
          title: "הנחיות מערכת",
          items: ["נא להקפיד על דיוק מירבי."]
        }
      ]
    };

    return NextResponse.json({
      success: true,
      instructions: config?.value || defaultInstructions
    });

  } catch (error) {
    console.error('Error fetching global instructions:', error);
    return serverError('Failed to fetch instructions');
  }
}