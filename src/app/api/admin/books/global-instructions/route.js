import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { badRequest, requireAccess, serverError } from '@/lib/apiResponse';
import { GLOBAL_FINISH_QUESTIONS_KEY, normalizeGlobalFinishQuestions } from '@/lib/finishQuestions';

const CONFIG_KEY = 'global_editor_instructions';

export async function GET() {
  try {
    await connectDB();

    const [config, questionsConfig] = await Promise.all([
      SystemConfig.findOne({ key: CONFIG_KEY }).lean(),
      SystemConfig.findOne({ key: GLOBAL_FINISH_QUESTIONS_KEY }).lean()
    ]);
    const instructions = config?.value || { sections: [] };

    return NextResponse.json({
      success: true,
      instructions: instructions,
      finishQuestions: normalizeGlobalFinishQuestions(questionsConfig?.value)
    });

  } catch (error) {
    console.error('Error fetching global instructions:', error);
    return serverError('Failed to fetch instructions');
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    await connectDB();

    const body = await request.json();
    const { instructions, finishQuestions } = body;

    if (!instructions || !Array.isArray(instructions.sections)) {
      return badRequest('Invalid data format');
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

    // שאלות הבסיס בסיום עמוד — נשמרות רק כשנשלחו (לקוח ישן לא מוחק אותן)
    let savedQuestions;
    if (finishQuestions !== undefined) {
      savedQuestions = normalizeGlobalFinishQuestions(finishQuestions);
      await SystemConfig.findOneAndUpdate(
        { key: GLOBAL_FINISH_QUESTIONS_KEY },
        { $set: { value: savedQuestions, label: 'שאלות בסיס בסיום עמוד' } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
    }

    return NextResponse.json({
      success: true,
      instructions: updatedConfig.value,
      ...(savedQuestions ? { finishQuestions: savedQuestions } : {})
    });

  } catch (error) {
    console.error('Error saving global instructions:', error);
    return serverError('Failed to save instructions');
  }
}
