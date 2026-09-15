import { initializeAnalyticsRuntime } from './bootstrap.ts'

const runtime = await initializeAnalyticsRuntime({ provider: process.env.AI_PROVIDER })
const listener = runtime.app.listen(
  Number(process.env.PORT ?? 5174),
  process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DEPLOYMENT ? '0.0.0.0' : '127.0.0.1',
  () => console.log(`Chart API listening at http://127.0.0.1:${process.env.PORT ?? 5174}`),
)
const close = async () => {
  await new Promise<void>(resolve => listener.close(() => resolve()))
  await runtime.close()
}
process.once('SIGINT', () => void close())
process.once('SIGTERM', () => void close())
