import path from 'node:path'

/**
 * Analytics is launched either from its package root (standalone) or from the
 * Supervisor package root (the production CommonJS bundle). Keep filesystem
 * resources source-relative in both cases without relying on import.meta.url.
 */
export function analyticsRuntimeRoot(cwd = process.cwd()) {
  return path.basename(cwd) === 'analytics' ? cwd : path.resolve(cwd, 'analytics')
}

export function analyticsServerRoot(cwd = process.cwd()) {
  return path.join(analyticsRuntimeRoot(cwd), 'server')
}

export function operationalMigrationsDirectory(cwd = process.cwd()) {
  return path.join(analyticsServerRoot(cwd), 'migrations')
}

export function examplesMigrationsDirectory(cwd = process.cwd()) {
  return path.join(analyticsServerRoot(cwd), 'examples', 'migrations')
}