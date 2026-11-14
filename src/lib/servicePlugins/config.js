// הגדרות תוספי השירות מ-env. טהור (node built-ins בלבד) — נטען גם ע"י node --test.
import path from 'node:path'

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

/** @returns {{enabled:boolean, storageDir:string, workerSecret:string}} */
export function getServicePluginConfig(env = process.env) {
  return {
    enabled: bool(env.SERVICE_PLUGINS_ENABLED, false),
    storageDir: env.SERVICE_PLUGIN_STORAGE_DIR?.trim() || path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage', 'service-plugins'),
    workerSecret: env.SERVICE_PLUGIN_WORKER_SECRET?.trim() || '',
  }
}

export const isServicePluginsEnabled = (env = process.env) => getServicePluginConfig(env).enabled
