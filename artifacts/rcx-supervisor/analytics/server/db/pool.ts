import { Pool } from 'pg'
export function createDatabasePool(connectionString=process.env.DATABASE_URL) {
 if(!connectionString) throw new Error('DATABASE_URL is required for persistent synthetic reports. Start the local database and configure the API environment.')
 return new Pool({connectionString,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000})
}
