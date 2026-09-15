import { createDatabasePool } from './pool.ts'
import { migrateDatabase } from './migrate.ts'
import { PostgresOperationalService } from '../operational/service.ts'
const pool=createDatabasePool()
try {
 await migrateDatabase(pool)
 if(process.argv.includes('--seed')) {
  const result=await new PostgresOperationalService(pool).ensureCoverage({start:'2026-08-31T00:00:00Z',end:'2026-09-14T00:00:00Z'})
  console.log(JSON.stringify(result,null,2))
 } else console.log('Database migrations are current.')
} finally {await pool.end()}
