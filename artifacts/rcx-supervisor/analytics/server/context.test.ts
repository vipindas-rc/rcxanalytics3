import { expect, it } from 'vitest'
import { datasetVersion, effectiveFilters, normalizeSource } from './context.ts'
import { emptyWorkspace } from './store.ts'
import { ensureBriefings } from './briefing.ts'
it('normalizes legacy briefing IDs and derives metadata and revision from persisted data',()=>{
 const w=emptyWorkspace();ensureBriefings(w);const b=w.briefings[0],widget=b.widgets[0]
 const session={id:'s',title:'Advisor',advisor:true,projectId:null,createdAt:'now',updatedAt:'now',messages:[]}
 const source=normalizeSource(w,{sourceContext:{artifactId:widget.artifactId,briefingId:b.id,widgetId:widget.id,filters:[],datasetVersion:'fake',reportingWindow:'fake'}},session)!
 expect(source.briefingWidgetId).toBe(widget.id);expect(source.reportingWindow).toBe(b.reportingWindow)
 const data=w.datasets.find(d=>d.id===source.datasetId)!
 expect(source.datasetVersion).toBe(datasetVersion(data));data.rows[0].abandonmentRate=0
 expect(datasetVersion(data)).not.toBe(source.datasetVersion)
})
it('combines base and request filters without dropping either and deduplicates consistently',()=>{
 const w=emptyWorkspace();ensureBriefings(w);const data=w.datasets[0]
 const base=[{field:'category',operator:'eq' as const,value:'Sales'}]
 expect(effectiveFilters(base,base,data)).toEqual(base)
 expect(effectiveFilters(base,[{field:'abandonmentRate',operator:'gte',value:10}],data)).toHaveLength(2)
 expect(()=>effectiveFilters(base,[{field:'category',operator:'eq',value:10}],data)).toThrow('wrong value type')
})
