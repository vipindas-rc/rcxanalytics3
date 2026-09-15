import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { Store } from './store.ts'
import { createApp } from './app.ts'
import type { Model } from './inference.ts'
import { createArtifact, generateDataset } from '../src/lib/analytics.ts'
const servers:Server[]=[]
it('discards late inference after a workspace reset',async()=>{
 let release!:()=>void;let entered!:()=>void
 const started=new Promise<void>(r=>entered=r),blocked=new Promise<void>(r=>release=r)
 const {api,store}=await setup(async()=>{entered();await blocked;return {kind:'text',text:'Late answer'}})
 const s=(await api('/sessions',{})).data
 await api('/conversation',{sessionId:s.id,requestId:'reset-pending',question:'Wait'})
 await started;expect((await api('/workspace/reset',{})).status).toBe(200);release()
 await new Promise(r=>setTimeout(r,30))
 const w=await store.read();expect(w.sessions).toEqual([]);expect(w.requests).toEqual([]);expect(w.responseCache).toEqual({})
})
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>s.close(()=>r()))))})
async function setup(model:Model, operational?: any, examples?: any){const dir=await mkdtemp(path.join(os.tmpdir(),'analytics-test-'));const store=new Store(path.join(dir,'workspace.json'));await store.initialize();const server=(createApp as (...args:any[])=>ReturnType<typeof createApp>)(store,model,operational,undefined,examples).listen(0,'127.0.0.1');servers.push(server);await new Promise<void>((r,reject)=>server.on('listening',r).on('error',reject));const address=server.address() as {port:number};const api=async(route:string,body?:unknown,method=body?'POST':'GET')=>{const response=await fetch(`http://127.0.0.1:${address.port}/api${route}`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:response.status===204?null:response.headers.get('content-type')?.includes('application/json')?await response.json() as any:{error:await response.text()}}};return {store,api,dir}}
async function completed(api:any,id:string){for(let i=0;i<100;i++){const result=await api(`/requests/${id}`);if(result.data.status!=='pending')return result.data;await new Promise(r=>setTimeout(r,10))}throw Error('Request timed out')}
describe('persistent API',()=>{
 it('prepares persisted workflow data before publishing the catalog donut starter', async () => {
  const calls: string[] = []
  const examples = {
   prepareWorkflowVolume: async () => { calls.push('prepare'); return { datasetId: 'workflow-example', revisionId: 'workflow-revision', generated: true } },
   queryWorkflowVolume: async () => {
    calls.push('query')
    return { datasetId: 'workflow-example', revisionId: 'workflow-revision', rows: [{ workflow: 'Lead Follow-up', interactionVolume: 40 }, { workflow: 'Billing Inquiry', interactionVolume: 30 }], fields: [{ id: 'workflow', name: 'Workflow', type: 'category' }, { id: 'interactionVolume', name: 'Interaction Volume', type: 'number', unit: 'interactions' }], evidence: { totalInteractions: 70, definitions: { interactionVolume: 'Synthetic interaction volume.' }, provenance: { generatorVersion: 'workflow-volume-v1', assumptions: [] } }, pagination: { offset: 0, limit: 2, total: 2 } }
   },
  }
  let modelCalls = 0
  const { api } = await setup(async () => { modelCalls++; return { kind: 'text', text: 'Unexpected model answer' } }, undefined, examples)
  const session = (await api('/sessions', {})).data
  const request = await api('/conversation', { sessionId: session.id, requestId: 'workflow-donut', question: 'Compare fictional workflow interaction volumes by workflow as a donut chart.' })
  const terminal = await completed(api, request.data.id)
  expect(terminal.status, terminal.error).toBe('completed')
  const workspace = (await api('/workspace')).data
  const message = workspace.sessions.find((item: any) => item.id === session.id).messages.at(-1)
  const artifact = workspace.artifacts.find((item: any) => item.id === message.artifactIds[0])
  expect(calls).toEqual(['prepare', 'query'])
  expect(modelCalls).toBe(0)
  expect(artifact.view).toMatchObject({ chartType: 'donut', x: 'workflow', y: 'interactionVolume' })
  expect(message.evidence.reference.datasetRevision).toBe('workflow-revision')
 })
 it('lists the verified report catalog without creating workspace state', async () => {
  const { api } = await setup(async () => ({ kind: 'text', text: 'Ready' }))
  const reports = await api('/reports')
  expect(reports.status).toBe(200)
  expect(reports.data.some((item: any) => item.title === 'Agent Activity Overview' && item.type === 'dashboard')).toBe(true)
  expect(reports.data.some((item: any) => item.id === 'agent-activity-report' && item.type === 'report' && item.availability === 'supported')).toBe(true)
  expect(reports.data.some((item: any) => item.title === 'Agent Disposition' && item.type === 'report')).toBe(true)
 })
 it('requires persistent storage for Agent Activity rather than falling back to a fixture', async () => {
  let calls = 0
  const { api } = await setup(async () => { calls++; return { kind: 'text', text: 'Model response' } })
  const session = (await api('/sessions', {})).data
  const opened = await api('/conversation', { sessionId: session.id, requestId: 'open-agent-activity', question: '', reportId: 'agent-activity-report', reportVersion: 1 })
  expect(opened.status).toBe(503)
  expect(opened.data.error).toMatch(/PostgreSQL storage/i)
  expect(calls).toBe(0)
 })
 it('prepares a deterministic synthetic catalog report without invoking the model', async () => {
  let calls = 0
  const examples = {
   prepareWorkflowVolume: async () => ({ datasetId: 'workflow', revisionId: 'workflow-revision', generated: false }),
   queryWorkflowVolume: async () => ({ datasetId: 'workflow', revisionId: 'workflow-revision', rows: [], fields: [], evidence: {}, pagination: { offset: 0, limit: 0, total: 0 } }),
   prepareExample: async () => ({ datasetId: 'inbound-example', revisionId: 'inbound-revision', start: '2026-08-31T00:00:00.000Z', end: '2026-09-14T00:00:00.000Z', generated: true }),
   queryExample: async () => ({ datasetId: 'inbound-example', revisionId: 'inbound-revision', rows: [{ category: 'Inbound', count: 42 }], fields: [{ id: 'category', name: 'Category', type: 'category' as const }, { id: 'count', name: 'Count', type: 'number' as const, unit: 'items' }], evidence: { definitions: { count: 'Persisted synthetic count.' }, provenance: { generatorVersion: 'test', assumptions: [] } }, pagination: { offset: 0, limit: 1, total: 1 } }),
  }
  const { api } = await setup(async () => { calls++; return { kind: 'text', text: 'Model response' } }, undefined, examples)
  const session = (await api('/sessions', {})).data
  const request = await api('/conversation', { sessionId: session.id, requestId: 'preview-inbound', question: '', reportId: 'inbound-interactions-overview', reportVersion: 1 })
  await completed(api, request.data.id)
  const workspace = (await api('/workspace')).data
  expect(workspace.sessions.find((item: any) => item.id === session.id).messages.at(-1).text).toContain('persisted synthetic records')
  expect(calls).toBe(0)
 })
 it('uses selected catalog content identifiers rather than the question wording', async () => {
  let prepared: any
  const examples = {
   prepareExample: async (input: any) => { prepared = input; return { datasetId: 'contact-center', revisionId: 'contact-revision', start: '2026-08-31T00:00:00.000Z', end: '2026-09-14T00:00:00.000Z', generated: true } },
   queryExample: async () => ({ datasetId: 'contact-center', revisionId: 'contact-revision', rows: [{ queue: 'Sales', abandonmentRate: 12 }], fields: [{ id: 'queue', name: 'Queue', type: 'category' as const }, { id: 'abandonmentRate', name: 'Abandonment Rate', type: 'number' as const, unit: '%' }], evidence: { definitions: { abandonmentRate: 'Abandoned divided by offered.' }, provenance: { generatorVersion: 'test', assumptions: [] } }, pagination: { offset: 0, limit: 1, total: 1 } }),
  }
  const { api } = await setup(async () => ({ kind: 'text', text: 'Unexpected model answer' }), undefined, examples)
  const session = (await api('/sessions', {})).data
  const request = await api('/conversation', { sessionId: session.id, requestId: 'selected-content', question: 'Show the selected item.', reportId: 'contact-center-activity-overview', reportVersion: 1, selectedContentIds: ['queue-abandonment-rate'], presentationPreference: 'chart' })
  expect((await completed(api, request.data.id)).status).toBe('completed')
  expect(prepared.domain).toBe('queue-abandonment')
  const workspace = (await api('/workspace')).data
  expect(workspace.artifacts.at(-1).view).toMatchObject({ chartType: 'bar', x: 'queue', y: 'abandonmentRate' })
 })
 it('does not substitute queue abandonment data for a different queue metric', async () => {
  let prepared: any
  const examples = {
   prepareExample: async (input: any) => { prepared = input; return { datasetId: 'service-level-example', revisionId: 'service-level-revision', start: '2026-08-31T00:00:00.000Z', end: '2026-09-14T00:00:00.000Z', generated: true } },
   queryExample: async () => ({ datasetId: 'service-level-example', revisionId: 'service-level-revision', rows: [{ queue: 'Sales', serviceLevel: 83 }, { queue: 'Billing', serviceLevel: 76 }], fields: [{ id: 'queue', name: 'Queue', type: 'category' as const }, { id: 'serviceLevel', name: 'Service Level', type: 'number' as const, unit: '%' }], evidence: { totals: { serviceLevel: 79.5 }, definitions: { serviceLevel: 'Mean daily synthetic service level.' }, provenance: { generatorVersion: 'test', assumptions: [] } }, pagination: { offset: 0, limit: 2, total: 2 } }),
  }
  const { api } = await setup(async () => ({ kind: 'text', text: 'Unexpected model answer' }), undefined, examples)
  const session = (await api('/sessions', {})).data
  const request = await api('/conversation', { sessionId: session.id, requestId: 'queue-service-level', question: 'Compare service level by queue as a bar chart.' })
  const terminal = await completed(api, request.data.id)
  expect(terminal.status, terminal.error).toBe('completed')
  expect(prepared.domain).not.toBe('queue-abandonment')
  expect(prepared.definition.measures[0]).toMatchObject({ id: 'serviceLevel', unit: '%' })
  const workspace = (await api('/workspace')).data
  const artifact = workspace.artifacts.at(-1)
  expect(artifact.view).toMatchObject({ chartType: 'bar', x: 'queue', y: 'serviceLevel', aggregation: 'mean' })
 })
 it('reports factual controller phases in their actual order while a response is being prepared',async()=>{let release!:()=>void;let started!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve);const modelStarted=new Promise<void>(resolve=>started=resolve);const {api}=await setup(async()=>{started();await waiting;return {kind:'text',text:'Ready'}});const session=(await api('/sessions',{})).data;const request=(await api('/conversation',{sessionId:session.id,requestId:'phase-request',question:'Show the current state.'})).data;await modelStarted;const pending=(await api(`/requests/${request.id}`)).data;expect(pending.phase).toBe('planning');expect(pending.phaseHistory.map((entry:any)=>entry.phase)).toEqual(['initializing','planning']);release();expect((await completed(api,request.id)).phase).toBe('Complete')})
 it('isolates concurrent sessions, serializes edits and deduplicates request delivery',async()=>{let release!:()=>void;let calls=0;const wait=new Promise<void>(r=>release=r);const {api}=await setup(async()=>{calls++;await wait;return {kind:'text',text:'Synthetic analytics ready.'}});const a=(await api('/sessions',{})).data;const b=(await api('/sessions',{})).data;const turn={sessionId:a.id,requestId:'request-one',question:'Hello'};expect((await api('/conversation',turn)).status).toBe(202);await api('/conversation',turn);expect((await api('/conversation',{...turn,requestId:'request-duplicate'})).status).toBe(409);await api('/conversation',{...turn,sessionId:b.id,requestId:'request-two'});await api(`/sessions/${a.id}`,{title:'My title'},'PATCH');await api('/projects',{name:'During inference'});release();expect((await completed(api,'request-one')).status).toBe('completed');await completed(api,'request-two');const w=(await api('/workspace')).data;expect(calls).toBe(2);expect(w.sessions.find((s:any)=>s.id===a.id).title).toBe('My title');expect(w.sessions.every((s:any)=>s.messages.length===2)).toBe(true);expect(w.projects.some((p:any)=>p.name==='During inference')).toBe(true)})
 it('records failure and retries without duplicating user message',async()=>{let calls=0;const {api}=await setup(async()=>{if(!calls++)throw Error('Authentication unavailable');return {kind:'text',text:'Ready'}});const s=(await api('/sessions',{})).data;await api('/conversation',{sessionId:s.id,requestId:'failed',question:'Hello'});expect((await completed(api,'failed')).error).toContain('Authentication');await api('/conversation',{sessionId:s.id,requestId:'retry',question:'Hello',retryOf:'failed'});expect((await completed(api,'retry')).status).toBe('completed');expect((await api('/workspace')).data.sessions[0].messages.filter((m:any)=>m.role==='user')).toHaveLength(1)})
 it('uses the nearest earlier chart as context after a clarification turn', async () => {
  let captured: any
  const { api, store } = await setup(async context => { captured = context; return { kind: 'text', text: 'Ready' } })
  const session = (await api('/sessions', {})).data
  const dataset = generateDataset({ title: 'Queues', seed: 7, fields: [
    { id: 'queue', name: 'Queue', type: 'category', values: ['Billing', 'Support'] },
    { id: 'count', name: 'Count', type: 'number', min: 1, max: 10 },
  ] })
  const artifact = createArtifact(dataset, { chartType: 'bar', x: 'queue', y: 'count', aggregation: 'sum', filters: [] }, 'Queue volume')
  await store.mutate(workspace => {
    workspace.datasets.push(dataset); workspace.artifacts.push(artifact)
    const target = workspace.sessions.find(item => item.id === session.id)!
    target.messages.push(
      { id: 'chart-answer', role: 'assistant', text: 'Chart', createdAt: 'now', artifactIds: [artifact.id] },
      { id: 'clarification', role: 'assistant', text: 'Which pyramid?', createdAt: 'now', choices: ['Population pyramid'] },
    )
  })
  await api('/conversation', { sessionId: session.id, requestId: 'pyramid-choice', question: 'Population pyramid' })
  await completed(api, 'pyramid-choice')
  const completedSession = (await api('/workspace')).data.sessions.find((item: any) => item.id === session.id)
  expect(completedSession.messages.find((item: any) => item.id === 'clarification').choices).toBeUndefined()
  expect(captured.artifact.id).toBe(artifact.id)
  expect(captured.dataset.id).toBe(dataset.id)
 })
 it('persists an Advisor session with its explicit widget source', async () => {
  let captured: any
  const { api, store } = await setup(async context => { captured = context; return { kind: 'text', text: 'Advisor answer' } })
  const advisor = (await api('/sessions', { advisor: true })).data
  const dataset = generateDataset({ title: 'Queues', seed: 9, fields: [{ id: 'queue', name: 'Queue', type: 'category', values: ['Sales'] }, { id: 'rate', name: 'Rate', type: 'number', min: 1, max: 10 }] })
  const artifact = createArtifact(dataset, { chartType: 'bar', x: 'queue', y: 'rate', aggregation: 'mean', filters: [] }, 'Queue abandonment')
  await store.mutate(workspace => { workspace.datasets.push(dataset); workspace.artifacts.push(artifact) })
  await api('/conversation', { sessionId: advisor.id, requestId: 'advisor-turn', question: 'Help me understand this', contextArtifactId: artifact.id, sourceLabel: 'Queue abandonment · morning', sourceContext: { artifactId: artifact.id, datasetId: dataset.id, filters: [], sourceLabel: 'Queue abandonment · morning' } })
  await completed(api, 'advisor-turn')
  const workspace = (await api('/workspace')).data
  expect(workspace.sessions.find((session: any) => session.id === advisor.id).advisor).toBe(true)
  expect(workspace.requests.find((request: any) => request.id === 'advisor-turn').sourceLabel).toContain('morning')
  expect(workspace.sessions.find((session: any) => session.id === advisor.id).title).toContain('Help me understand')
  expect(captured.artifact.id).toBe(artifact.id)
 })
 it('deletes a project while preserving its conversations outside the project', async () => {
  const { api } = await setup(async () => ({ kind: 'text', text: 'Ready' }))
  const session = (await api('/sessions', { projectId: 'project-inbox' })).data
  await api('/dashboards', { title: 'Weekly', projectId: 'project-inbox' })
  expect((await api('/projects/project-inbox', undefined, 'DELETE')).status).toBe(204)
  const workspace = (await api('/workspace')).data
  expect(workspace.projects).toHaveLength(0)
  expect(workspace.sessions.find((item: any) => item.id === session.id).projectId).toBeNull()
  expect(workspace.dashboards).toHaveLength(0)
 })
 it('backs up migration and preserves exact old rows; restart fails pending attempts',async()=>{const {store,dir}=await setup(async()=>({kind:'text',text:'Ready'}));const rows=[{Month:'Jan',Calls:42},{Month:'Feb',Calls:53}];await writeFile(store.file,JSON.stringify({version:1,projects:[{id:'p',name:'Analytics'}],sessions:[{id:'s',title:'Legacy',projectId:'p',createdAt:'old',updatedAt:'old',messages:[{id:'m',role:'assistant',text:'Old',chartId:'c'}],charts:[{id:'c',title:'Calls',rows,intent:{chartType:'bar'}}]}],dashboards:[]}));await store.initialize();expect((await store.read()).datasets[0].rows).toEqual(rows);expect((await store.read()).sessions[0].messages[0].artifactIds).toEqual(['c']);expect((await readdir(dir)).some(f=>f.includes('v1-backup'))).toBe(true);await store.mutate(w=>w.requests.push({id:'r',sessionId:'s',question:'x',status:'pending',phase:'Working',userMessageId:'u',createdAt:'now'}));await new Store(store.file).initialize();expect((await store.read()).requests[0].status).toBe('failed');await writeFile(store.file,'{ broken');await expect(store.initialize()).rejects.toThrow('recovery');expect(await readFile(store.file,'utf8')).toBe('{ broken')})
 it.each([2, 3, 4])('upgrades workspace v%s idempotently without changing saved evidence or references', async version => {
  const { store } = await setup(async () => ({ kind: 'text', text: 'Ready' }))
  const dataset = generateDataset({ title: 'Saved evidence', seed: 31, fields: [
   { id: 'cohort', name: 'Cohort', type: 'category', values: ['AI', 'Human'] },
   { id: 'count', name: 'Count', type: 'number', min: 2, max: 10 },
  ] })
  const artifact = createArtifact(dataset, { chartType: 'bar', x: 'cohort', y: 'count', aggregation: 'sum', filters: [] }, 'Saved comparison', 'plotly')
  const workspace = await store.read()
  workspace.datasets.push(dataset)
  workspace.artifacts.push(artifact)
  workspace.savedCharts.push({ id: 'saved-comparison', artifactId: artifact.id, projectId: 'project-inbox', title: 'Keep me' })
  workspace.preferences[artifact.id] = 'chartjs'
  workspace.dashboards.push({ id: 'saved-dashboard', projectId: 'project-inbox', title: 'Saved dashboard', revision: 1, filters: [], history: [], widgets: [{ id: 'saved-widget', artifactId: artifact.id, title: artifact.title }] })
  const legacy = { ...workspace, version }
  await writeFile(store.file, JSON.stringify(legacy))
  await store.initialize()
  const once = await store.read()
  await store.initialize()
  expect(await store.read()).toEqual(once)
  expect(once.datasets).toEqual(workspace.datasets)
  expect(once.artifacts).toEqual(workspace.artifacts)
  expect(once.savedCharts).toEqual(workspace.savedCharts)
  expect(once.dashboards).toEqual(workspace.dashboards)
  expect(once.preferences).toEqual(workspace.preferences)
 })
 it('rejects competing dashboard revisions',async()=>{const {api}=await setup(async()=>({kind:'text',text:'ok'}));const d=(await api('/dashboards',{title:'Weekly',projectId:'project-inbox'})).data;const updated=await api(`/dashboards/${d.id}`,{revision:1,title:'Updated'},'PATCH');expect(updated.data.revision).toBe(2);expect(updated.data.history[0].title).toBe('Weekly');expect((await api(`/dashboards/${d.id}`,{revision:1,title:'Lost'},'PATCH')).status).toBe(409)})
 it('persists deterministic briefing snapshots and idempotent chart membership', async () => {
  const { api } = await setup(async () => ({ kind: 'text', text: 'Ready' }))
  const briefings = (await api('/briefings/ensure', {})).data
  expect(briefings).toHaveLength(2)
  const widgets = briefings.map((item: any) => item.widgets).flat()
  expect(widgets).toHaveLength(28)
  expect(widgets.filter((widget: any) => widget.section === 'Chart examples').map((widget: any) => widget.chartType).sort()).toEqual(['area', 'heatmap', 'pie', 'regression', 'area', 'heatmap', 'pie', 'regression'].sort())
  const workspace = (await api('/workspace')).data
  const artifactId = workspace.briefings[0].widgets[0].artifactId
  const first = await api('/saved-charts', { artifactId, projectId: 'project-inbox' })
  const second = await api('/saved-charts', { artifactId, projectId: 'project-inbox' })
  expect(first.status).toBe(201)
  expect(second.status).toBe(200)
  expect(second.data.id).toBe(first.data.id)
 })
 it('adds an artifact to a dashboard once without changing history on a duplicate', async () => {
  const { api } = await setup(async () => ({ kind: 'text', text: 'Ready' }))
  await api('/briefings/ensure', {})
  const workspace = (await api('/workspace')).data
  const dashboard = (await api('/dashboards', { title: 'Daily review', projectId: 'project-inbox' })).data
  const artifactId = workspace.briefings[0].widgets[0].artifactId
  const first = await api(`/dashboards/${dashboard.id}/widgets`, { artifactId })
  const second = await api(`/dashboards/${dashboard.id}/widgets`, { artifactId })
  expect(first.status).toBe(201)
  expect(second.status).toBe(200)
  expect(second.data.widgets).toHaveLength(1)
  expect(second.data.history).toHaveLength(first.data.history.length)
 })
 it('resets user workspace state while preserving briefing snapshots and their charts', async () => {
  const { api } = await setup(async () => ({ kind: 'text', text: 'Ready' }))
  await api('/briefings/ensure', {})
  const session = (await api('/sessions', {})).data
  const dashboard = (await api('/dashboards', { title: 'Daily review', projectId: 'project-inbox' })).data
  const before = (await api('/workspace')).data
  const briefingArtifactIds = before.briefings.flatMap((briefing: any) => briefing.widgets.map((widget: any) => widget.artifactId)).sort()
  expect(session.id).toBeTruthy(); expect(dashboard.id).toBeTruthy()
  const reset = await api('/workspace/reset', {})
  expect(reset.data.sessions).toEqual([])
  expect(reset.data.dashboards).toEqual([])
  expect(reset.data.projects).toEqual([{ id: 'project-inbox', name: 'Analytics' }])
  expect(reset.data.briefings).toHaveLength(2)
  expect(reset.data.artifacts.map((artifact: any) => artifact.id).sort()).toEqual(briefingArtifactIds)
 })
})


describe('operational report API adapter', () => {
 const scope = { start: '2026-09-01T00:00:00.000Z', end: '2026-09-04T00:00:00.000Z' }
 function operationalFixture() {
  const coverageCalls: unknown[] = []
  const queryCalls: unknown[] = []
  const result = {
   datasetId: 'qa-operational-dataset', revisionId: 'qa-revision-1',
   rows: [{ agent: 'Atlas', agentType: 'ai', activeMinutes: 12, channel: 'voice' }, { agent: 'Avery', agentType: 'human', activeMinutes: 18, channel: 'voice' }],
   fields: [{ id: 'agent', name: 'Agent', type: 'category' }, { id: 'agentType', name: 'Agent type', type: 'category' }, { id: 'activeMinutes', name: 'Handling minutes', type: 'number', unit: 'minutes' }, { id: 'channel', name: 'Channel', type: 'category' }],
   evidence: { datasetId: 'qa-operational-dataset', revisionId: 'qa-revision-1', scope: { start: '2026-08-31T00:00:00.000Z', end: '2026-09-14T00:00:00.000Z' }, activeAgents: { ai: 1, human: 1, total: 2 }, interactions: { ai: 1, human: 1, total: 1, transferred: 1 }, handlingMinutes: { ai: 12, human: 18, total: 30 }, recordCount: 2, definitions: { activeAgents: 'Distinct agents with matching segments.', interactions: 'Distinct customer interactions.', handlingMinutes: 'Clipped handling minutes.', transferred: 'Interactions handled by both cohorts.' }, provenance: { synthetic: true, generatorVersion: 'agent-events-v1', assumptions: [] }, coverage: { complete: true, ownerDays: ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'], timezone: 'UTC' } },
   pagination: { offset: 0, limit: 100, total: 2 },
  }
  const service = {
   ensureCoverage: async (input: unknown) => { coverageCalls.push(input); return { ...scope, datasetId: result.datasetId, revisionId: result.revisionId, generated: coverageCalls.length === 1 } },
   query: async (input: any): Promise<any> => {
    queryCalls.push(input)
    if (input.intent === 'count' || input.intent === 'comparison') return {
     ...structuredClone(result),
     rows: [{ agentType: 'ai', activeAgents: 1, interactions: 1, handlingMinutes: 12 }, { agentType: 'human', activeAgents: 1, interactions: 1, handlingMinutes: 18 }],
     fields: [{ id: 'agentType', name: 'Agent type', type: 'category' }, { id: 'activeAgents', name: 'Active agents', type: 'number', unit: 'agents' }, { id: 'interactions', name: 'Interactions', type: 'number', unit: 'interactions' }, { id: 'handlingMinutes', name: 'Handling minutes', type: 'number', unit: 'minutes' }],
    }
    return structuredClone(result)
   },
  }
  return { service, result, coverageCalls, queryCalls }
 }

 it('queries an Agent Activity report directly and reuses its persisted revision without AI', async () => {
  const fixture = operationalFixture()
  let modelCalls = 0
  const { api } = await setup(async () => { modelCalls++; return { kind: 'text', text: 'Unexpected model' } }, fixture.service)
  const first = await api('/reports/agent-activity-report/query', scope)
  expect(first.status).toBe(200)
  expect(first.data.rows).toEqual(fixture.result.rows)
  expect(first.data.evidence).toBeTruthy()
  const repeated = await api('/reports/agent-activity-report/query', scope)
  expect(repeated.status).toBe(200)
  expect(repeated.data.rows).toEqual(first.data.rows)
  expect(fixture.queryCalls).toHaveLength(2)
  expect(fixture.queryCalls.every((query:any) => query.revisionId === 'qa-revision-1')).toBe(true)
  expect(modelCalls).toBe(0)
 })

 it('attaches persisted report rows and an analysis reference to a selected-report answer', async () => {
  const fixture = operationalFixture()
  let modelCalls = 0
  const { api } = await setup(async () => { modelCalls++; return { kind: 'text', text: 'Unexpected model' } }, fixture.service)
  const session = (await api('/sessions', {})).data
  const attempt = await api('/conversation', { sessionId: session.id, requestId: 'operational-open', reportId: 'agent-activity-report', reportVersion: 1, question: '' })
  expect(attempt.status).toBe(202)
  const terminal = await completed(api, attempt.data.id)
  expect(terminal.status, terminal.error).toBe('completed')
  const workspace = (await api('/workspace')).data
  const message = workspace.sessions.find((item:any) => item.id === session.id).messages.at(-1)
  expect(message.analysisReference).toMatchObject({ datasetId: 'qa-operational-dataset', datasetRevision: 'qa-revision-1', reportId: 'agent-activity-report' })
  expect(message.artifactIds).toHaveLength(1)
  const artifact = workspace.artifacts.find((item:any) => item.id === message.artifactIds[0])
  expect(artifact.view.chartType).toBe('table')
  expect(workspace.datasets.find((item:any) => item.id === artifact.datasetId).rows).toEqual(fixture.result.rows)
  expect(modelCalls).toBe(0)
 })

 it('renders a bar chart when the persisted-report question asks for one', async () => {
  const fixture = operationalFixture()
  const { api } = await setup(async () => ({ kind: 'text', text: 'Unexpected model' }), fixture.service)
  const session = (await api('/sessions', {})).data
  const attempt = await api('/conversation', { sessionId: session.id, requestId: 'operational-bar', reportId: 'agent-activity-report', reportVersion: 1, question: 'Show this as a bar chart.' })
  await completed(api, attempt.data.id)
  const workspace = (await api('/workspace')).data
  const message = workspace.sessions.find((item:any) => item.id === session.id).messages.at(-1)
  const artifact = workspace.artifacts.find((item:any) => item.id === message.artifactIds[0])
  expect(artifact.view).toMatchObject({ chartType: 'bar', x: 'agentType', y: 'activeAgents', aggregation: 'sum' })
 })

 it('honors a plural cohort-count bar-chart request instead of substituting handling minutes', async () => {
  const fixture = operationalFixture()
  fixture.service.query = async (input: any): Promise<any> => {
   fixture.queryCalls.push(input)
   return {
    ...structuredClone(fixture.result),
    rows: [{ agentType: 'ai', activeAgents: 1, interactions: 1, handlingMinutes: 12 }, { agentType: 'human', activeAgents: 1, interactions: 1, handlingMinutes: 18 }],
    fields: [{ id: 'agentType', name: 'Agent type', type: 'category' }, { id: 'activeAgents', name: 'Active agents', type: 'number', unit: 'agents' }, { id: 'interactions', name: 'Interactions', type: 'number', unit: 'interactions' }, { id: 'handlingMinutes', name: 'Handling minutes', type: 'number', unit: 'minutes' }],
   }
  }
  const { api } = await setup(async () => ({ kind: 'text', text: 'Unexpected model' }), fixture.service)
  const session = (await api('/sessions', {})).data
  const attempt = await api('/conversation', { sessionId: session.id, requestId: 'operational-plural-bars', reportId: 'agent-activity-report', reportVersion: 1, question: 'Show human vs AI in bar charts.' })
  await completed(api, attempt.data.id)
  const workspace = (await api('/workspace')).data
  const message = workspace.sessions.find((item:any) => item.id === session.id).messages.at(-1)
  const artifact = workspace.artifacts.find((item:any) => item.id === message.artifactIds[0])
  expect(artifact.view).toMatchObject({ chartType: 'bar', x: 'agentType', y: 'activeAgents', aggregation: 'sum' })
  expect(message.text).toContain('AI')
 })

 it('routes an unselected AI-versus-human agent request through the operational cohort adapter', async () => {
  const fixture = operationalFixture()
  fixture.service.query = async (input: any): Promise<any> => {
   fixture.queryCalls.push(input)
   return {
    ...structuredClone(fixture.result),
    rows: [{ agentType: 'ai', activeAgents: 3, interactions: 14, handlingMinutes: 120 }, { agentType: 'human', activeAgents: 5, interactions: 22, handlingMinutes: 380 }],
    fields: [{ id: 'agentType', name: 'Agent type', type: 'category' }, { id: 'activeAgents', name: 'Active agents', type: 'number', unit: 'agents' }, { id: 'interactions', name: 'Interactions', type: 'number', unit: 'interactions' }, { id: 'handlingMinutes', name: 'Handling minutes', type: 'number', unit: 'minutes' }],
    evidence: { ...structuredClone(fixture.result.evidence), scope: { start: input.start, end: input.end, ...(input.asOf ? { asOf: input.asOf } : {}) }, activeAgents: { ai: 3, human: 5, total: 8 }, interactions: { ai: 14, human: 22, total: 28, transferred: 8 }, handlingMinutes: { ai: 120, human: 380, total: 500 } },
   }
  }
  const { api } = await setup(async () => ({ kind: 'text', text: 'The generic model must not answer an AI-versus-human agent count.' }), fixture.service)
  const session = (await api('/sessions', {})).data
  const attempt = await api('/conversation', { sessionId: session.id, requestId: 'unselected-agent-cohorts', question: 'How many AI agents versus human agents are live right now?' })
  await completed(api, attempt.data.id)
  const workspace = (await api('/workspace')).data
  const message = workspace.sessions.find((item: any) => item.id === session.id).messages.at(-1)
  const artifact = workspace.artifacts.find((item: any) => item.id === message.artifactIds[0])
  expect(message.text).toMatch(/3 online AI agents and 5 online human agents/)
  expect(message.analysisReference).toMatchObject({ reportId: 'agent-activity-report', datasetId: 'qa-operational-dataset' })
  expect(artifact.view).toMatchObject({ chartType: 'bar', x: 'agentType', y: 'activeAgents', aggregation: 'sum' })
  expect(workspace.datasets.find((item: any) => item.id === artifact.datasetId).rows).toEqual([
   { agentType: 'ai', activeAgents: 3, interactions: 14, handlingMinutes: 120 },
   { agentType: 'human', activeAgents: 5, interactions: 22, handlingMinutes: 380 },
  ])
 })

 it('returns a recoverable query error when operational storage is unavailable', async () => {
  const { api } = await setup(async () => ({ kind: 'text', text: 'Unexpected model' }))
  const response = await api('/reports/agent-activity-report/query', scope)
  expect(response.status).toBe(503)
  expect(response.data.error).toMatch(/database|storage|PostgreSQL/i)
  expect(response.data.error).not.toMatch(/catalog preview|data has not been added/i)
 })
})
