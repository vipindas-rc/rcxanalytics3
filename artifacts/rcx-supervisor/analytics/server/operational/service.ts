import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { GENERATOR_VERSION, agentProfiles, generateDay, normalizePeriod } from './generator.ts'

export type CoverageInput={datasetId?:string;start:string;end:string;seed?:number}
export type CoverageResult={datasetId:string;revisionId:string;start:string;end:string;generated:boolean}
export type OperationalQuery={revisionId:string;start:string;end:string;asOf?:string;agentType?:'ai'|'human';intent?:'activity'|'count'|'comparison'|'presence';offset?:number;limit?:number}
const category=(id:string,name:string)=>({id,name,type:'category' as const})
const number=(id:string,name:string,unit?:string)=>({id,name,type:'number' as const,...(unit?{unit}:{})})
const activityFields=[category('agent','Agent'),category('agentType','Agent Type'),category('channel','Channel'),category('interactionId','Interaction'),number('activeMinutes','Handling Minutes','minutes'),{id:'startedAt',name:'Started At',type:'date' as const}]

export class PostgresOperationalService {
 private pool:Pool
 constructor(pool:Pool){this.pool=pool}
 async ensureCoverage(input:CoverageInput):Promise<CoverageResult> {
  const period=normalizePeriod(input.start,input.end),seed=input.seed??20260914
  if(!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer.')
  const datasetId=input.datasetId??`synthetic-${GENERATOR_VERSION}-${seed}`
  if(!datasetId || datasetId.length>200) throw new Error('Invalid dataset identity.')
  const client=await this.pool.connect()
  try {
   await client.query('BEGIN')
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`rcx-coverage:${datasetId}`])
   await client.query('INSERT INTO rcx_data.datasets(id,seed,generator_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[datasetId,seed,GENERATOR_VERSION])
   const stored=(await client.query('SELECT seed,generator_version FROM rcx_data.datasets WHERE id=$1',[datasetId])).rows[0]
   if(Number(stored.seed)!==seed || stored.generator_version!==GENERATOR_VERSION) throw new Error('Dataset identity already belongs to a different generator or seed.')
   for(const agent of agentProfiles) await client.query('INSERT INTO rcx_data.agents(dataset_id,id,name,agent_type) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[datasetId,agent.id,agent.name,agent.agentType])
   const covered=new Set((await client.query("SELECT to_char(owner_day,'YYYY-MM-DD') AS day FROM rcx_data.batches WHERE dataset_id=$1 AND domain='agent-activity'",[datasetId])).rows.map(row=>row.day))
   const missing=period.days.filter(day=>!covered.has(day))
   for(const day of missing) await this.insertDay(client,datasetId,day,seed)
   let revisionId=(await client.query('SELECT id FROM rcx_data.revisions WHERE dataset_id=$1 AND sealed ORDER BY ordinal DESC LIMIT 1',[datasetId])).rows[0]?.id as string|undefined
   if(missing.length || !revisionId) {
    revisionId=randomUUID()
    await client.query('INSERT INTO rcx_data.revisions(id,dataset_id) VALUES($1,$2)',[revisionId,datasetId])
    await client.query('INSERT INTO rcx_data.revision_batches(revision_id,batch_id) SELECT $1,id FROM rcx_data.batches WHERE dataset_id=$2',[revisionId,datasetId])
    await client.query('UPDATE rcx_data.revisions SET sealed=true WHERE id=$1',[revisionId])
   }
   await client.query('COMMIT')
   return {datasetId,revisionId,start:period.start,end:period.end,generated:missing.length>0}
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 }
 private async insertDay(client:PoolClient,datasetId:string,day:string,seed:number) {
  const batch=generateDay(day,seed),batchId=randomUUID()
  await client.query("INSERT INTO rcx_data.batches(id,dataset_id,domain,owner_day) VALUES($1,$2,'agent-activity',$3)",[batchId,datasetId,day])
  for(const row of batch.interactions) await client.query('INSERT INTO rcx_data.interactions(dataset_id,id,batch_id,started_at,ended_at,channel) VALUES($1,$2,$3,$4,$5,$6)',[datasetId,row.id,batchId,row.startedAt,row.endedAt,row.channel])
  for(const row of batch.segments) await client.query('INSERT INTO rcx_data.handling_segments(dataset_id,id,interaction_id,agent_id,started_at,ended_at) VALUES($1,$2,$3,$4,$5,$6)',[datasetId,row.id,row.interactionId,row.agentId,row.startedAt,row.endedAt])
  for(const row of batch.presence) await client.query('INSERT INTO rcx_data.agent_presence_intervals(dataset_id,id,batch_id,agent_id,started_at,ended_at,state) VALUES($1,$2,$3,$4,$5,$6,$7)',[datasetId,row.id,batchId,row.agentId,row.startedAt,row.endedAt,row.state])
  await client.query('UPDATE rcx_data.batches SET sealed=true WHERE id=$1',[batchId])
 }
 async query(input:OperationalQuery) {
  const period=normalizePeriod(input.start,input.end)
  if(input.agentType!==undefined && !['ai','human'].includes(input.agentType)) throw new Error('Unsupported agent type.')
  if(input.intent!==undefined && !['activity','count','comparison','presence'].includes(input.intent)) throw new Error('Unsupported operational query intent.')
  const limit=input.limit??100,offset=input.offset??0
  if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(offset)||offset<0) throw new Error('Invalid pagination.')
  const revision=(await this.pool.query('SELECT dataset_id FROM rcx_data.revisions WHERE id=$1 AND sealed',[input.revisionId])).rows[0]
  if(!revision) throw new Error('The saved dataset revision is unavailable.')
  const coverage=(await this.pool.query("SELECT to_char(b.owner_day,'YYYY-MM-DD') AS day FROM rcx_data.revision_batches r JOIN rcx_data.batches b ON b.id=r.batch_id WHERE r.revision_id=$1 AND b.domain='agent-activity'",[input.revisionId])).rows.map(row=>String(row.day))
  if(period.days.some(day=>!coverage.includes(day))) throw new Error('This saved dataset revision does not cover the requested period. Prepare a new revision to extend its scope.')
  if (input.intent === 'presence') {
   const asOf = input.asOf ?? input.end
   if (!Number.isFinite(Date.parse(asOf))) throw new Error('A valid as-of timestamp is required for presence.')
   const values = [input.revisionId, asOf, input.agentType ?? null]
   const scopedPresence = `FROM rcx_data.revision_batches rb JOIN rcx_data.agent_presence_intervals p ON p.batch_id=rb.batch_id JOIN rcx_data.agents a ON a.dataset_id=p.dataset_id AND a.id=p.agent_id WHERE rb.revision_id=$1 AND p.started_at <= $2::timestamptz AND p.ended_at > $2::timestamptz AND ($3::text IS NULL OR a.agent_type=$3)`
   const grouped = (await this.pool.query(`SELECT a.agent_type AS "agentType",count(DISTINCT a.id)::int AS "activeAgents",0::int AS interactions,0::float8 AS "handlingMinutes" ${scopedPresence} GROUP BY a.agent_type ORDER BY a.agent_type`, values)).rows
   const ai = grouped.find(row => row.agentType === 'ai'), human = grouped.find(row => row.agentType === 'human')
   const total = Number(ai?.activeAgents ?? 0) + Number(human?.activeAgents ?? 0)
   const evidence = { datasetId: String(revision.dataset_id), revisionId: input.revisionId, scope: { start: period.start, end: period.end, asOf, ...(input.agentType ? { agentType: input.agentType } : {}) }, activeAgents: { ai: Number(ai?.activeAgents ?? 0), human: Number(human?.activeAgents ?? 0), total }, interactions: { ai: 0, human: 0, total: 0, transferred: 0 }, handlingMinutes: { ai: 0, human: 0, total: 0 }, recordCount: total, definitions: { activeAgents: 'Distinct agents with a synthetic online-presence interval satisfying start <= asOf < end. Available and busy states both count as online.' }, provenance: { synthetic: true, generatorVersion: GENERATOR_VERSION, assumptions: ['Online presence is a synthetic availability interval and is not inferred from handling activity.'] }, coverage: { complete: true, ownerDays: coverage.sort(), timezone: 'UTC' } }
   return { datasetId: String(revision.dataset_id), revisionId: input.revisionId, rows: grouped, fields: [category('agentType','Agent Type'), number('activeAgents','Online Agents','agents'), number('interactions','Interactions','interactions'), number('handlingMinutes','Handling Minutes','minutes')], evidence, pagination: { offset: 0, limit: 2, total: grouped.length } }
  }
  const values=[input.revisionId,period.start,period.end,input.agentType??null]
  const scoped=`FROM rcx_data.revision_batches rb JOIN rcx_data.interactions i ON i.batch_id=rb.batch_id JOIN rcx_data.handling_segments s ON s.dataset_id=i.dataset_id AND s.interaction_id=i.id JOIN rcx_data.agents a ON a.dataset_id=s.dataset_id AND a.id=s.agent_id WHERE rb.revision_id=$1 AND s.started_at<$3::timestamptz AND s.ended_at>$2::timestamptz AND ($4::text IS NULL OR a.agent_type=$4)`
  const duration=`extract(epoch FROM (least(s.ended_at,$3::timestamptz)-greatest(s.started_at,$2::timestamptz)))/60.0`
  const grouped=(await this.pool.query(`SELECT a.agent_type AS "agentType",count(DISTINCT a.id)::int AS "activeAgents",count(DISTINCT i.id)::int AS interactions,coalesce(sum(${duration}),0)::float8 AS "handlingMinutes" ${scoped} GROUP BY a.agent_type ORDER BY a.agent_type`,values)).rows
  const totals=(await this.pool.query(`SELECT count(DISTINCT a.id)::int AS agents,count(DISTINCT i.id)::int AS interactions,count(*)::int AS rows,coalesce(sum(${duration}),0)::float8 AS minutes ${scoped}`,values)).rows[0]
  const transfer=(await this.pool.query(`SELECT count(*)::int AS total FROM (SELECT i.id ${scoped} GROUP BY i.id HAVING count(DISTINCT a.agent_type)=2) transferred`,values)).rows[0].total
  const ai=grouped.find(row=>row.agentType==='ai'),human=grouped.find(row=>row.agentType==='human')
  const evidence={datasetId:String(revision.dataset_id),revisionId:input.revisionId,scope:{start:period.start,end:period.end,...(input.agentType?{agentType:input.agentType}:{})},activeAgents:{ai:ai?.activeAgents??0,human:human?.activeAgents??0,total:totals.agents},interactions:{ai:ai?.interactions??0,human:human?.interactions??0,total:totals.interactions,transferred:transfer},handlingMinutes:{ai:ai?.handlingMinutes??0,human:human?.handlingMinutes??0,total:totals.minutes},recordCount:totals.rows,definitions:{activeAgents:'Distinct agents with handling segments overlapping the reporting period.',interactions:'Distinct customer interactions with matching handling segments. AI and human cohorts overlap for transferred interactions; cohort counts must not be added.',handlingMinutes:'Handling-segment duration clipped to the reporting period, in minutes.',transferred:'Distinct interactions with both AI and human handling segments in the effective scope. This is the overlap to subtract when combining cohort interaction counts.'},provenance:{synthetic:true,generatorVersion:GENERATOR_VERSION,assumptions:['Agent Activity is represented by handling segments, not login or availability states.']},coverage:{complete:true,ownerDays:coverage.sort(),timezone:'UTC'}}
  if(input.intent==='count'||input.intent==='comparison') return {datasetId:String(revision.dataset_id),revisionId:input.revisionId,rows:grouped,fields:[category('agentType','Agent Type'),number('activeAgents','Active Agents','agents'),number('interactions','Interactions','interactions'),number('handlingMinutes','Handling Minutes','minutes')],evidence,pagination:{offset:0,limit:2,total:grouped.length}}
  const rows=(await this.pool.query(`SELECT a.name AS agent,a.agent_type AS "agentType",i.channel,i.id AS "interactionId",(${duration})::float8 AS "activeMinutes",to_char(greatest(s.started_at,$2::timestamptz) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startedAt" ${scoped} ORDER BY s.started_at,s.id LIMIT $5 OFFSET $6`,[...values,limit,offset])).rows
  return {datasetId:String(revision.dataset_id),revisionId:input.revisionId,rows,fields:activityFields,evidence,pagination:{offset,limit,total:totals.rows}}
 }
}
