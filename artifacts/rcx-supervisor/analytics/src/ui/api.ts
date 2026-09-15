export const STANDALONE_ANALYTICS_API_BASE = '/api/analytics'

export function analyticsApiBase(configuredBase: string | undefined = import.meta.env.VITE_ANALYTICS_API_BASE): string {
  const base = (configuredBase ?? STANDALONE_ANALYTICS_API_BASE).trim().replace(/\/+$/, '')
  if (!base.startsWith('/') || base.startsWith('//')) throw new Error('VITE_ANALYTICS_API_BASE must be an absolute application path.')
  return base || STANDALONE_ANALYTICS_API_BASE
}

export function analyticsApiPath(path: string, base = analyticsApiBase()): string {
  if (!path.startsWith('/')) throw new Error('Analytics API paths must start with "/".')
  return `${analyticsApiBase(base)}${path}`
}

export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(analyticsApiPath(path), { method, signal, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (response.status === 204) return undefined as T
  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch { throw new Error('The local server is unavailable or restarting. Please retry in a moment.') }
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`)
  return result as T
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
