/**
 * MongoDB אמיתי לבדיקות אינטגרציה (mongodb-memory-server-core, standalone כמו בייצור).
 * אם הבינארי אינו זמין — הבדיקות מסומנות skip עם הסיבה, לא "עוברות".
 */
import mongoose from 'mongoose';
import '../../../models/ErrorReport.js';
import '../../../models/CorrectionJob.js';
import '../../../models/ChangePackage.js';
import '../../../models/PublishAttempt.js';
import '../../../models/WorkerHeartbeat.js';
import '../../../models/CorrectionEvent.js';
import '../../../models/SentEmailLog.js';
import '../../../models/User.js';

export async function startMongo() {
  let server;
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server-core');
    server = await MongoMemoryServer.create();
  } catch (err) {
    return { skip: `MongoDB לא זמין לבדיקות: ${err?.message}` };
  }
  await mongoose.connect(server.getUri(), { dbName: 'corrections_test' });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return {
    skip: false,
    async reset() {
      await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
    },
    async stop() {
      await mongoose.disconnect();
      await server.stop();
    },
  };
}
