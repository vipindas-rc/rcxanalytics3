import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import type { Workspace, Dataset, Artifact } from '../src/lib/model.ts'
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
export const now = () => new Date().toISOString()
export function emptyWorkspace(): Workspace { return { version: 4, revision: 0, sessions: [], projects: [{ id: 'project-inbox', name: 'Analytics' }], datasets: [], artifacts: [], savedCharts: [], dashboards: [], requests: [], preferences: {}, briefings: [], responseCache: {} } }
export function migrate(old: any): Workspace {
 if (old.version === 4) { for (const key of ['sessions','projects','datasets','artifacts','savedCharts','dashboards','requests','briefings']) if (!Array.isArray(old[key])) throw new Error(`Storage recovery required: missing ${key}.`); if (!old.responseCache || typeof old.responseCache !== 'object') old.responseCache = {}; return old }
 if (old.version === 3) { for (const key of ['sessions','projects','datasets','artifacts','savedCharts','dashboards','requests','briefings']) if (!Array.isArray(old[key])) throw new Error(`Storage recovery required: missing ${key}.`); return { ...old, version: 4, responseCache: old.responseCache && typeof old.responseCache === 'object' ? old.responseCache : {} } }
 if (old.version === 2) { for (const key of ['sessions','projects','datasets','artifacts','savedCharts','dashboards','requests']) if (!Array.isArray(old[key])) throw new Error(`Storage recovery required: missing ${key}.`); return { ...old, version: 4, briefings: [], responseCache: old.responseCache && typeof old.responseCache === 'object' ? old.responseCache : {} } }
 if (old.version !== 1 || !Array.isArray(old.sessions) || !Array.isArray(old.projects)) throw new Error('Storage recovery required: unsupported workspace.')
 const next = emptyWorkspace(); next.projects = old.projects
 next.sessions = old.sessions.map((s: any) => {
  for (const c of s.charts ?? []) {
   if (!Array.isArray(c.rows)) throw new Error('Storage recovery required: legacy chart has no rows.')
   const fields = Object.keys(c.rows[0] ?? {}).map(name => ({ id: name, name, type: typeof c.rows[0][name] === 'number' ? 'number' as const : 'category' as const }))
   const dataset: Dataset = { id: id('dataset'), title: c.title, seed: c.intent?.seed ?? 1, fields, rows: c.rows, createdAt: c.createdAt ?? now(), colors: {} }
   const artifact: Artifact = { id: c.id, title: c.title, datasetId: dataset.id, view: { chartType: c.intent?.chartType ?? 'bar', x: fields.find(f => f.type === 'category')?.id, y: fields.find(f => f.type === 'number')?.id, series: fields.filter(f => f.type === 'category')[1]?.id, aggregation: 'sum', filters: [] }, renderer: c.renderer ?? 'echarts', summary: c.intent?.summary ?? '', kpis: [], createdAt: c.createdAt ?? now() }
   next.datasets.push(dataset); next.artifacts.push(artifact)
  }
  return { id: s.id, title: s.title, renamed: true, projectId: s.projectId, createdAt: s.createdAt, updatedAt: s.updatedAt, messages: s.messages.map((m: any) => ({ ...m, createdAt: m.createdAt ?? s.updatedAt, artifactIds: m.chartId ? [m.chartId] : undefined })) }
 })
 next.dashboards = (old.dashboards ?? []).map((d: any) => ({ id: d.id, title: d.name, projectId: next.projects[0]?.id ?? 'project-inbox', revision: 1, filters: [], history: [], widgets: d.chartIds.map((a: string) => ({ id: id('widget'), artifactId: a, title: next.artifacts.find(c => c.id === a)?.title ?? 'Chart' })) }))
 return next
}
export class Store {
 private queue: Promise<unknown> = Promise.resolve()
  file: string
  private pool?: Pool
  constructor(target: string | Pool) {
   if (typeof target === 'string') this.file = target
   else { this.file = ''; this.pool = target }
  }
  async initialize(...sourceFiles: string[]) {
   if (this.pool) return this.initializeDatabase(sourceFiles)
   await mkdir(path.dirname(this.file), { recursive: true }); let raw: string; try { raw = await readFile(this.file, 'utf8') } catch (error: any) { if (error.code !== 'ENOENT') throw error; await this.write(emptyWorkspace()); return }
   let old; try { old = JSON.parse(raw) } catch { throw new Error('Storage recovery required: workspace JSON is malformed. The original file was preserved.') }
   const w = migrate(old); let changed = old.version !== 4
   if (changed) await writeFile(`${this.file}.v${old.version}-backup-${Date.now()}`, raw, { flag: 'wx' })
   for (const r of w.requests) if (r.status === 'pending') { r.status = 'failed'; r.phase = 'Interrupted'; r.error = 'Server restarted during this request. Retry to continue.'; changed = true }
   if (changed) await this.write(w)
 }
  private async readCurrent(): Promise<Workspace> {
   if (this.pool) {
    const result = await this.pool.query<{ workspace: Workspace }>('SELECT workspace FROM rcx_data.analytics_workspace WHERE workspace_id=1')
    if (!result.rows.length) throw new Error('Analytics workspace is not initialized.')
    return migrate(result.rows[0].workspace)
   }
   return migrate(JSON.parse(await readFile(this.file, 'utf8')))
  }
  /**
   * Reads share the same serialization queue as mutations. This gives the
   * gateway a linearizable workspace view while native UI refreshes, session
   * creation, and conversation intake arrive together; a stale refresh cannot
   * interleave with a transaction that establishes a returned session ID.
   */
  read(): Promise<Workspace> {
   const result = this.queue.then(() => this.readCurrent())
   this.queue = result.catch(() => {})
   return result
  }
  private async write(w: Workspace) {
   if (this.pool) {
    await this.pool.query('INSERT INTO rcx_data.analytics_workspace(workspace_id, revision, workspace) VALUES(1,$1,$2::jsonb) ON CONFLICT (workspace_id) DO UPDATE SET revision=EXCLUDED.revision, workspace=EXCLUDED.workspace, updated_at=now()', [w.revision, w])
    return
   }
   const temp = `${this.file}.${crypto.randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(w, null, 2)); await rename(temp, this.file)
  }
  private async initializeDatabase(sourceFiles: string[]) {
   if (!this.pool) throw new Error('Analytics workspace database is unavailable.')
   const existing = await this.pool.query<{ workspace: Workspace }>('SELECT workspace FROM rcx_data.analytics_workspace WHERE workspace_id=1')
   if (!existing.rows.length) {
    let workspace: Workspace | undefined
    for (const source of sourceFiles) {
     try {
      const raw = await readFile(source, 'utf8')
      let old: any
      try { old = JSON.parse(raw) } catch { throw new Error('Storage recovery required: workspace JSON is malformed. The original file was preserved.') }
      workspace = migrate(old)
      break
     } catch (error: any) {
      if (error?.code === 'ENOENT') continue
      throw error
     }
    }
    workspace ??= emptyWorkspace()
    for (const request of workspace.requests) if (request.status === 'pending') {
     request.status = 'failed'; request.phase = 'Interrupted'; request.error = 'Server restarted during this request. Retry to continue.'
    }
    await this.pool.query('INSERT INTO rcx_data.analytics_workspace(workspace_id, revision, workspace) VALUES(1,$1,$2::jsonb) ON CONFLICT (workspace_id) DO NOTHING', [workspace.revision, workspace])
    return
   }
   const stored = existing.rows[0].workspace
   const before = JSON.stringify(stored)
   const workspace = migrate(stored)
   for (const request of workspace.requests) if (request.status === 'pending') {
    request.status = 'failed'; request.phase = 'Interrupted'; request.error = 'Server restarted during this request. Retry to continue.'
   }
   if (JSON.stringify(workspace) !== before) await this.write(workspace)
  }
  mutate<T>(fn: (w: Workspace) => T): Promise<T> {
   const result = this.queue.then(async () => {
    if (this.pool) {
     const client = await this.pool.connect()
     try {
      await client.query('BEGIN')
      const result = await client.query<{ workspace: Workspace }>('SELECT workspace FROM rcx_data.analytics_workspace WHERE workspace_id=1 FOR UPDATE')
      if (!result.rows.length) throw new Error('Analytics workspace is not initialized.')
      const w = migrate(result.rows[0].workspace)
      const before = JSON.stringify(w)
      const value = fn(w)
      if (JSON.stringify(w) !== before) {
       w.revision++
       await client.query('UPDATE rcx_data.analytics_workspace SET revision=$1, workspace=$2::jsonb, updated_at=now() WHERE workspace_id=1', [w.revision, w])
      }
      await client.query('COMMIT')
      return value
     } catch (error) {
      await client.query('ROLLBACK')
      throw error
     } finally { client.release() }
    }
    const w = migrate(JSON.parse(await readFile(this.file, 'utf8')))
    const before = JSON.stringify(w); const value = fn(w)
    if (JSON.stringify(w) !== before) { w.revision++; await this.write(w) }
    return value
   })
   this.queue = result.catch(() => {})
   return result
  }
}
