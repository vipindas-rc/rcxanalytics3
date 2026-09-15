export const nativeRuntime = process.env.ANALYTICS_E2E_MODE === 'native'

/** Standalone source runs at `/`; the managed host mounts Analytics at `/analytics`. */
export function appPath(suffix = '') {
  if (!suffix) return nativeRuntime ? '/analytics' : '/'
  return `/analytics${suffix}`
}

export function apiPath(suffix = '') {
  return `${nativeRuntime ? '/analytics-api' : '/api/analytics'}${suffix}`
}

export function apiRoute(suffix = '/**') {
  return `**${apiPath(suffix)}`
}