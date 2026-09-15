import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir } from 'node:fs/promises'
import { Store } from './store.ts'
import { codexModel } from './inference.ts'
import { openAIModel } from './openaiProvider.ts'
import { createApp } from './app.ts'
import { createDatabasePool } from './db/pool.ts'
import { createExamplesDatabasePool } from './db/examplesPool.ts'
import { migrateDatabase } from './db/migrate.ts'
import { migrateExamplesDatabase } from './examples/migrate.ts'
import { PostgresOperationalService } from './operational/service.ts'
import { PostgresSyntheticExamplesService } from './examples/service.ts'
import { providerStatus, selectProvider } from './providerSelection.ts'
import { createOpenAIOperationalAgents } from './openaiOperationalAgents.ts'
import { shouldBootstrapDemo } from './demo/replitBootstrap.ts'
import { bootstrapDemoData } from './demo/replitDataBootstrap.ts'
const directory=path.dirname(fileURLToPath(import.meta.url))
const demoBootstrap = shouldBootstrapDemo()
const pool=createDatabasePool()
const examplesPool=createExamplesDatabasePool()
await migrateDatabase(pool)
await migrateExamplesDatabase(examplesPool)
const store=new Store(pool)
await store.initialize(path.join(directory,'data','workspace.json'), ...(demoBootstrap ? [path.join(directory,'../demo/workspace.seed.json')] : []))
const operationalService = new PostgresOperationalService(pool)
const examplesService = new PostgresSyntheticExamplesService(examplesPool)
await bootstrapDemoData(demoBootstrap, operationalService, examplesService)
await mkdir(path.join(directory,'sandbox'),{recursive:true})
const provider=selectProvider({provider:process.env.AI_PROVIDER,directory:path.join(directory,'sandbox'),codex:codexModel,openai:openAIModel})
const operationalAgents=provider.provider==='openai' ? createOpenAIOperationalAgents() : undefined
const app=createApp(store,provider.model,operationalService,operationalAgents,examplesService)
app.get('/api/status',async(_q,r)=>{
 if(provider.provider==='openai') return r.json(await providerStatus({provider:'openai',apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL}))
 try{const result=await promisify(execFile)('codex',['login','status'],{timeout:5000});const detail=`${result.stdout}\n${result.stderr}`.trim();r.json({provider:'codex',connected:/logged in/i.test(detail),detail})}catch{r.json({provider:'codex',connected:false,detail:'Codex login is unavailable.'})}
})
const listener=app.listen(Number(process.env.PORT??5174),process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DEPLOYMENT ? '0.0.0.0' : '127.0.0.1',()=>console.log('Chart API listening at http://127.0.0.1:5174'))
const close=async()=>{listener.close();await Promise.all([pool.end(),examplesPool.end()])}
process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close())
