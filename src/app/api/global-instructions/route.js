import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { serverError } from '@/lib/apiResponse';
import { GLOBAL_FINISH_QUESTIONS_KEY, normalizeGlobalFinishQuestions } from '@/lib/finishQuestions';

export async function GET() {
  try {
    await connectDB();

    const [config, questionsConfig] = await Promise.all([
      SystemConfig.findOne({ key: 'global_editor_instructions' }).lean(),
      SystemConfig.findOne({ key: GLOBAL_FINISH_QUESTIONS_KEY }).lean()
    ]);

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
      instructions: config?.value || defaultInstructions,
      // שאלות הבסיס לחלון "סיום עמוד"
      finishQuestions: normalizeGlobalFinishQuestions(questionsConfig?.value)
    });

  } catch (error) {
    console.error('Error fetching global instructions:', error);
    return serverError('Failed to fetch instructions');
  }
}
