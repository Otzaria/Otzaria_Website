import nextEnv from '@next/env';
import { runScheduledAppReportsSync } from '../src/lib/app-reports/cron-client.js';

nextEnv.loadEnvConfig(process.cwd(), false);
try {
  const result = await runScheduledAppReportsSync();
  console.log(JSON.stringify({ ranAt: result.ranAt, cleanup: result.cleanup }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
