import type { Express, RequestHandler } from 'express'

export type AnalyticsRuntime = {
  app: Express
  close: () => Promise<void>
}

export type AnalyticsLifecycleState = 'idle' | 'initializing' | 'ready' | 'failed' | 'stopped'

type Options = {
  initialize: () => Promise<AnalyticsRuntime>
  initializationTimeoutMs?: number
  log?: (message: string) => void
}

/**
 * Owns one Analytics runtime for the host process.  The adapter deliberately
 * keeps Analytics' internal `/api` routes intact while exposing only the host
 * gateway prefix.
 */
export class AnalyticsLifecycle {
  private state: AnalyticsLifecycleState = 'idle'
  private runtime?: AnalyticsRuntime
  private startPromise?: Promise<void>
  private timeout?: ReturnType<typeof setTimeout>
  private readonly readinessWarningMs: number
  private readonly log: (message: string) => void

  constructor(private readonly options: Options) {
    this.readinessWarningMs = options.initializationTimeoutMs ?? 30_000
    this.log = options.log ?? (message => console.info(`[analytics] ${message}`))
  }

  getState() {
    return this.state
  }

  start(): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.state = 'initializing'
    const startedAt = Date.now()
    this.timeout = setTimeout(() => {
      if (this.state !== 'initializing') return
      // A slow migration/bootstrap is not an initialization failure. Keep
      // returning the same immediate 503 readiness response until it settles;
      // a healthy runtime may still publish once setup completes.
      this.log(`initialization is still running after ${this.readinessWarningMs}ms`)
    }, this.readinessWarningMs)

    this.startPromise = this.options.initialize().then(async runtime => {
      clearTimeout(this.timeout)
      if (this.state !== 'initializing') {
        // Shutdown, rather than an arbitrary readiness deadline, is the only
        // reason to discard a completed initializer.
        await runtime.close()
        return
      }
      this.runtime = runtime
      this.state = 'ready'
      this.log(`ready in ${Date.now() - startedAt}ms`)
    }).catch(error => {
      clearTimeout(this.timeout)
      if (this.state === 'initializing') {
        this.state = 'failed'
        // Initialization errors can include database connection details. The
        // host only needs timing/state here; keep diagnostics server-private.
        this.log(`initialization failed in ${Date.now() - startedAt}ms`)
      }
      throw error
    })
    return this.startPromise
  }

  readonly middleware: RequestHandler = (req, res) => {
    if (this.state !== 'ready' || !this.runtime) {
      const initializing = this.state === 'idle' || this.state === 'initializing'
      res.setHeader('Retry-After', '2')
      res.status(503).json({
        error: initializing ? 'Analytics is initializing. Retry shortly.' : 'Analytics is temporarily unavailable.',
        code: initializing ? 'analytics_initializing' : 'analytics_unavailable',
      })
      return
    }

    // Express removes `/analytics-api` from req.url when this middleware is
    // mounted. Re-add only Analytics' private prefix; do not redirect or make
    // a loopback request, so method, body, request ID, and headers are intact.
    const originalUrl = req.url
    req.url = `/api${originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`}`
    const restoreUrl = () => { req.url = originalUrl }
    res.once('finish', restoreUrl)
    res.once('close', restoreUrl)
    this.runtime.app(req, res)
  }

  async close() {
    clearTimeout(this.timeout)
    const runtime = this.runtime
    this.runtime = undefined
    if (this.state !== 'failed') this.state = 'stopped'
    if (runtime) await runtime.close()
  }
}

export function createAnalyticsLifecycle(options: Options) {
  return new AnalyticsLifecycle(options)
}