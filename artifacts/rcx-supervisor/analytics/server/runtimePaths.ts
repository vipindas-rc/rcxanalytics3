import path from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Analytics is launched either from its package root (standalone) or from the
 * Supervisor package root (the production CommonJS bundle). Keep filesystem
 * resources source-relative in both cases without relying on import.meta.url.
 */
export function analyticsRuntimeRoot(cwd = process.cwd()) {
  if (path.basename(cwd) === 'analytics') return cwd
  const candidates = [
    path.resolve(cwd, 'analytics'),
    path.resolve(cwd, 'artifacts', 'rcx-supervisor', 'analytics'),
    typeof __dirname === 'string' ? path.resolve(__dirname, 'analytics') : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]
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