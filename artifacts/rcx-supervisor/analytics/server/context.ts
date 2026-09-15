import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { Dataset, Filter, Session, SourceContext, Workspace } from '../src/lib/model.ts'
const value = z.union([z.string(), z.number().finite()])
const filterSchema = z.object({field:z.string().min(1),operator:z.enum(['eq','in','gte','lte']),value:z.union([value,z.array(value).min(1)])}).strict()
const sourceSchema = z.object({artifactId:z.string().min(1),filters:z.array(filterSchema).default([]),sourceLabel:z.string().max(200).optional(),dashboardId:z.string().optional(),dashboardRevision:z.number().int().positive().optional(),briefingId:z.string().optional(),briefingWidgetId:z.string().optional(),reportingWindow:z.string().optional(),comparisonWindow:z.string().optional(),metricTitle:z.string().optional(),entity:z.string().optional(),datasetId:z.string().optional(),datasetVersion:z.string().optional()}).strict()
export class ContextError extends Error { status=400 }
export function datasetVersion(dataset: Dataset): string {
 return createHash('sha256').update(JSON.stringify({fields:dataset.fields,rows:dataset.rows,seed:dataset.seed})).digest('hex')
}
export function effectiveFilters(base: Filter[], input: unknown, dataset: Dataset): Filter[] {
 return normalizeFilters([...base,...normalizeFilters(input??[],dataset)],dataset)
}
export function normalizeFilters(input: unknown, dataset: Dataset): Filter[] {
 const parsed=z.array(filterSchema).safeParse(input)
 if(!parsed.success)throw new ContextError('Filters must contain a valid field, operator, and scalar or list value.')
 const filters=parsed.data.map(filter=>{
  const field=dataset.fields.find(item=>item.id===filter.field)
  if(!field)throw new ContextError(`Filter field ${filter.field} is unavailable in this source.`)
  if((filter.operator==='in')!==Array.isArray(filter.value))throw new ContextError('Only the in operator accepts a list of values.')
  const values=Array.isArray(filter.value)?filter.value:[filter.value]
  if(values.some(item=>field.type==='number'?typeof item!=='number':typeof item!=='string'))throw new ContextError(`Filter ${field.name} has the wrong value type.`)
  if(['gte','lte'].includes(filter.operator)&&field.type==='category')throw new ContextError(`Range filtering is unavailable for ${field.name}.`)
  return {...filter,value:Array.isArray(filter.value)?[...new Set(filter.value)].sort((a,b)=>String(a).localeCompare(String(b))):filter.value}
 })
 return [...new Map(filters.map(filter=>[JSON.stringify(filter),filter])).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
export function normalizeSource(w: Workspace, body: any, session: Session): SourceContext | undefined {
 // Accept the old BriefingPage widgetId name while persisting only the canonical key.
 const supplied=body.sourceContext ? {...body.sourceContext} : undefined
 if(supplied?.widgetId !== undefined){supplied.briefingWidgetId ??= supplied.widgetId;delete supplied.widgetId}
 const artifactId=supplied?.artifactId??body.contextArtifactId
 const raw=supplied??(artifactId?{artifactId,filters:body.contextFilters??[],sourceLabel:body.sourceLabel,dashboardId:body.contextDashboardId}:session.advisor?session.advisorContext:undefined)
 if(!raw){if(body.contextFilters?.length)throw new ContextError('Select a source before applying Advisor filters.');return undefined}
 const parsed=sourceSchema.safeParse(raw)
 if(!parsed.success)throw new ContextError('Invalid Advisor source context.')
 const source=parsed.data
 const artifact=w.artifacts.find(item=>item.id===source.artifactId)
 if(!artifact)throw new ContextError('Advisor source artifact is unavailable. Select a source again.')
 const dataset=w.datasets.find(item=>item.id===artifact.datasetId)
 if(!dataset)throw new ContextError('Advisor source dataset is unavailable.')
 if(source.datasetId&&source.datasetId!==dataset.id)throw new ContextError('Advisor source dataset does not match this chart.')
 const normalized:SourceContext={...source,datasetId:dataset.id,datasetVersion:datasetVersion(dataset),filters:effectiveFilters(artifact.view.filters,source.filters,dataset),sourceLabel:source.sourceLabel?.trim()||artifact.title}
 if(source.dashboardId){const d=w.dashboards.find(item=>item.id===source.dashboardId);if(!d)throw new ContextError('Advisor dashboard is unavailable.');const revision=source.dashboardRevision??d.revision;const snapshot=revision===d.revision?d:d.history.find(item=>item.revision===revision);if(!snapshot||!snapshot.widgets.some(item=>item.artifactId===artifact.id))throw new ContextError('The source chart does not belong to this dashboard revision.');normalized.dashboardRevision=revision}
 if(source.briefingId||source.briefingWidgetId){const b=w.briefings.find(item=>item.id===source.briefingId);const widget=b?.widgets.find(item=>item.id===source.briefingWidgetId);if(!b||!widget||widget.artifactId!==artifact.id)throw new ContextError('The source chart does not belong to this briefing widget.');Object.assign(normalized,{reportingWindow:b.reportingWindow,comparisonWindow:b.comparisonWindow,metricTitle:widget.metricTitle??artifact.title,entity:widget.entity,sourceLabel:`${widget.metricTitle??artifact.title} · ${b.scenario}`})}
 return normalized
}
