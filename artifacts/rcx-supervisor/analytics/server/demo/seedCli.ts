import path from 'node:path'
import { fileURLToPath } from 'node:url'
export { restoreDemoWorkspace, writeDemoSeed } from './workspaceSeedIo.ts'
import { restoreDemoWorkspace, writeDemoSeed } from './workspaceSeedIo.ts'

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const action = process.argv[2]
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const source = process.argv[3] ?? path.join(root, 'server/data/workspace.json')
  const target = action === 'export' ? path.join(root, 'demo/workspace.seed.json') : path.join(root, 'server/data/workspace.json')
  if (action === 'export') await writeDemoSeed(source, target)
  else if (action === 'restore') await restoreDemoWorkspace(path.join(root, 'demo/workspace.seed.json'), target, process.argv.includes('--force'))
  else throw new Error('Use `export` or `restore`.')
}
