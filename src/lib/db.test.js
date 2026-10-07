// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('mongoose', () => ({ default: { connect } }))
beforeEach(() => { vi.resetModules(); connect.mockReset(); delete global.mongoose; vi.stubEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', '5000') })
afterEach(() => { vi.unstubAllEnvs(); delete global.mongoose })
it('preserves production budgets and pool options', async () => {
  const { mongoConnectionOptions } = await import('./db')
  expect(mongoConnectionOptions({})).toEqual({ bufferCommands: false, maxPoolSize: 10, minPoolSize: 5, connectTimeoutMS: 5000, socketTimeoutMS: 45000, serverSelectionTimeoutMS: 30000 })
  expect(mongoConnectionOptions({ MONGODB_SERVER_SELECTION_TIMEOUT_MS: '5000' }).serverSelectionTimeoutMS).toBe(5000)
})
it.each(['', 'bad', 'Infinity', '0', '-1', '120001', '3.5'])('rejects invalid selection deadline %s', async value => {
  const { mongoConnectionOptions } = await import('./db')
  expect(() => mongoConnectionOptions({ MONGODB_SERVER_SELECTION_TIMEOUT_MS: value })).toThrow('MONGODB_SERVER_SELECTION_TIMEOUT_MS')
})
it('shares pending connection and reuses the successful one', async () => {
  const client = { connected: true }; let finish
  connect.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { default: connectDB } = await import('./db')
  const first = connectDB(); const second = connectDB(); expect(connect).toHaveBeenCalledTimes(1)
  finish(client); expect(await first).toBe(client); expect(await second).toBe(client); expect(await connectDB()).toBe(client)
  expect(connect).toHaveBeenCalledTimes(1)
  expect(connect.mock.calls[0][1].serverSelectionTimeoutMS).toBe(5000)
})
it('failed connection can retry without keeping a poisoned promise', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  connect.mockRejectedValueOnce(new Error('refused')).mockResolvedValueOnce({ connected: true })
  const { default: connectDB } = await import('./db')
  await expect(connectDB()).rejects.toThrow('Database connection failed: refused')
  await expect(connectDB()).resolves.toEqual({ connected: true }); expect(connect).toHaveBeenCalledTimes(2)
  log.mockRestore()
})
