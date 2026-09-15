import { createHash } from 'node:crypto'

export const GENERATOR_VERSION = 'agent-events-v2'
export const MAX_LIFECYCLE_MS = 86_400_000
export type Agent = { id: string; name: string; agentType: 'ai' | 'human' }
export type Interaction = { id: string; startedAt: string; endedAt: string; channel: 'voice' | 'digital' }
export type Segment = { id: string; interactionId: string; agentId: string; startedAt: string; endedAt: string }
export type PresenceInterval = { id: string; agentId: string; startedAt: string; endedAt: string; state: 'available' | 'busy' }
export type Batch = { day: string; agents: Agent[]; interactions: Interaction[]; segments: Segment[]; presence: PresenceInterval[] }
export const agentProfiles: readonly Agent[] = [
 {id:'agt-001',name:'Avery Patel',agentType:'human'}, {id:'agt-002',name:'Jordan Lee',agentType:'human'},
 {id:'agt-003',name:'Mika Santos',agentType:'human'}, {id:'agt-004',name:'Noah Kim',agentType:'human'},
 {id:'agt-005',name:'Riley Morgan',agentType:'human'}, {id:'agt-101',name:'Atlas Assist',agentType:'ai'},
 {id:'agt-102',name:'Beacon Assist',agentType:'ai'}, {id:'agt-103',name:'Cedar Assist',agentType:'ai'},
]
export function normalizePeriod(start: string, end: string) {
 const first = Date.parse(start), last = Date.parse(end)
 if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first || last-first > 366*MAX_LIFECYCLE_MS) throw new Error('Choose a valid reporting period of at most 366 days.')
 const days: string[] = []
 for (let time = Math.floor(first/MAX_LIFECYCLE_MS)*MAX_LIFECYCLE_MS-MAX_LIFECYCLE_MS; time < last; time += MAX_LIFECYCLE_MS) days.push(new Date(time).toISOString().slice(0,10))
 return {start:new Date(first).toISOString(),end:new Date(last).toISOString(),days}
}
export function generateDay(day: string, seed: number): Batch {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || !Number.isSafeInteger(seed)) throw new Error('Invalid generation day or seed.')
 const origin = Date.parse(`${day}T00:00:00.000Z`)
 if (new Date(origin).toISOString().slice(0,10)!==day) throw new Error('Invalid generation day.')
 const digest = createHash('sha256').update(`${GENERATOR_VERSION}:${seed}:${day}`).digest()
 const batch: Batch = {day,agents:structuredClone([...agentProfiles]),interactions:[],segments:[],presence:[]}
 // A presence interval is a different fact from a handling segment. AI agents
 // are online for the synthetic day; human coverage rotates across day/night
 // shifts. The intervals make an `asOf` answer reproducible without using a
 // reporting-period activity count as a proxy for presence.
 for (const [index, agent] of agentProfiles.entries()) {
  const startsAt = index < 5 && index % 2 === 0 ? origin : origin + 12 * 60 * 60 * 1000
  const endsAt = index < 5 && index % 2 === 0 ? origin + 12 * 60 * 60 * 1000 : origin + 24 * 60 * 60 * 1000
  batch.presence.push({ id: `${day}-presence-${agent.id}`, agentId: agent.id, startedAt: new Date(startsAt).toISOString(), endedAt: new Date(endsAt).toISOString(), state: index % 3 === 0 ? 'busy' : 'available' })
 }
 for(let index=0;index<24;index++) {
  const id=`${day}-interaction-${index}`
  const start=origin+index*3_600_000+(index===23?55*60_000:digest[index]*1000)
  const duration=(5+digest[index]%20)*60_000
  const transferred=index%6===0
  const initial=transferred?agentProfiles[5+index%3]:agentProfiles[index%8]
  const end=start+duration
  batch.interactions.push({id,startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),channel:index%3===0?'digital':'voice'})
  const midpoint=transferred?start+Math.floor(duration/2):end
  batch.segments.push({id:`${id}-segment-0`,interactionId:id,agentId:initial.id,startedAt:new Date(start).toISOString(),endedAt:new Date(midpoint).toISOString()})
  if(transferred) batch.segments.push({id:`${id}-segment-1`,interactionId:id,agentId:agentProfiles[index%5].id,startedAt:new Date(midpoint).toISOString(),endedAt:new Date(end).toISOString()})
 }
 validateBatch(batch)
 return batch
}
export function validateBatch(batch: Batch) {
 const agents=new Set(batch.agents.map(agent=>agent.id)), interactions=new Map(batch.interactions.map(row=>[row.id,row]))
 if(agents.size!==batch.agents.length || interactions.size!==batch.interactions.length || new Set(batch.segments.map(row=>row.id)).size!==batch.segments.length || new Set(batch.presence.map(row=>row.id)).size!==batch.presence.length) throw new Error('Duplicate operational record.')
 for (const interval of batch.presence) if (!agents.has(interval.agentId) || !(Date.parse(interval.endedAt) > Date.parse(interval.startedAt))) throw new Error('Invalid agent presence interval.')
 for(const row of batch.interactions) if(!(Date.parse(row.endedAt)>Date.parse(row.startedAt)) || Date.parse(row.endedAt)-Date.parse(row.startedAt)>MAX_LIFECYCLE_MS) throw new Error('Invalid interaction duration.')
 for(const segment of batch.segments) {
  const interaction=interactions.get(segment.interactionId)
  if(!agents.has(segment.agentId)) throw new Error('Unknown segment agent.')
  if(!interaction || !(Date.parse(segment.endedAt)>Date.parse(segment.startedAt)) || segment.startedAt<interaction.startedAt || segment.endedAt>interaction.endedAt) throw new Error('Invalid segment relationship or interval.')
 }
 for(const interaction of batch.interactions) {
  const segments=batch.segments.filter(segment=>segment.interactionId===interaction.id).sort((a,b)=>a.startedAt.localeCompare(b.startedAt))
  if(!segments.length || segments[0].startedAt!==interaction.startedAt || segments.at(-1)!.endedAt!==interaction.endedAt || segments.some((segment,index)=>index>0 && segments[index-1].endedAt!==segment.startedAt)) throw new Error('Segments must cover the interaction exactly once.')
 }
}
