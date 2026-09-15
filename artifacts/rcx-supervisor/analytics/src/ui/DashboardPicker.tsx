import { useMemo, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Icon, Radio, RadioGroup, Text, TextField } from '@ringcentral/spring-ui'
import { FolderMd, PlusMd } from '@ringcentral/spring-icon'
import { ProgressButton } from './ProgressButton'
import type { Artifact, Dashboard, Project, Workspace } from '../lib/model'

type Props = {
  artifact: Artifact | null
  workspace: Workspace | null
  initialProjectId?: string | null
  onClose: () => void
  onCreateProject: (name: string) => Promise<Project>
  onCreateDashboard: (name: string, projectId: string) => Promise<Dashboard>
  onAdd: (dashboardId: string) => Promise<void>
  onSuccess: (dashboardId: string) => void
}

export function DashboardPicker({ artifact, workspace, initialProjectId, onClose, onCreateProject, onCreateDashboard, onAdd, onSuccess }: Props) {
  const [projectId, setProjectId] = useState<string | null>(initialProjectId ?? null)
  const [dashboardId, setDashboardId] = useState<string | null>(null)
  const [projectSearch, setProjectSearch] = useState('')
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [projectName, setProjectName] = useState('')
  const [dashboardName, setDashboardName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingDashboard, setCreatingDashboard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const projects = useMemo(() => workspace?.projects.filter(project => project.name.toLowerCase().includes(projectSearch.toLowerCase())) ?? [], [workspace, projectSearch])
  const dashboards = useMemo(() => workspace?.dashboards.filter(dashboard => dashboard.projectId === projectId && dashboard.title.toLowerCase().includes(dashboardSearch.toLowerCase())) ?? [], [workspace, projectId, dashboardSearch])
  const chooseProject = (id: string) => { setProjectId(id); setDashboardId(null); setDashboardSearch(''); setError('') }
  const createProject = async () => { if (!projectName.trim()) return; setSaving(true); setError(''); try { const project = await onCreateProject(projectName.trim()); setProjectName(''); setCreatingProject(false); chooseProject(project.id) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create this project.') } finally { setSaving(false) } }
  const createDashboard = async () => { if (!projectId || !dashboardName.trim()) return; setSaving(true); setError(''); try { const dashboard = await onCreateDashboard(dashboardName.trim(), projectId); setDashboardName(''); setCreatingDashboard(false); setDashboardId(dashboard.id) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create this dashboard.') } finally { setSaving(false) } }
  const add = async () => { if (!dashboardId || saving) return; setSaving(true); setError(''); try { await onAdd(dashboardId); onSuccess(dashboardId) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to add this chart. Please retry.') } finally { setSaving(false) } }
  return <Dialog open={!!artifact} onClose={() => !saving && onClose()} closeButton size="medium" aria-labelledby="add-to-dashboard-title">
    <DialogTitle id="add-to-dashboard-title">Add to dashboard</DialogTitle>
    <DialogContent>
      <div className="project-picker-heading"><Text>{artifact?.title}</Text><Text>Choose the project and dashboard that should contain this chart.</Text></div>
      <section className="dashboard-picker-step"><Text component="h3">1. Project</Text><TextField fullWidth label="Search projects" value={projectSearch} onChange={event => setProjectSearch(event.target.value)} />
        {creatingProject ? <div className="project-create-inline"><TextField autoFocus fullWidth label="New project name" value={projectName} onChange={event => setProjectName(event.target.value)} /><Button color="neutral" variant="outlined" disabled={!projectName.trim() || saving} onClick={() => void createProject()}>Create project</Button><Button color="neutral" variant="text" disabled={saving} onClick={() => setCreatingProject(false)}>Cancel</Button></div> : <Button color="neutral" variant="text" startIcon={PlusMd} disabled={saving} onClick={() => setCreatingProject(true)}>Create a project</Button>}
        {!projects.length && <Text className="project-picker-empty">{projectSearch ? 'No projects match your search.' : 'Create a project to organize your charts.'}</Text>}<RadioGroup aria-label="Choose project" name="dashboard-project-picker" value={projectId ?? ''} onChange={event => chooseProject((event.target as HTMLInputElement).value)} className="project-picker-list">{projects.map(project => <label key={project.id} className={`project-picker-row ${projectId === project.id ? 'is-selected' : ''}`}><span className="project-picker-icon"><Icon symbol={FolderMd} /></span><span className="project-picker-copy"><Text>{project.name}</Text><Text>{workspace?.dashboards.filter(dashboard => dashboard.projectId === project.id).length ?? 0} dashboards</Text></span><Radio value={project.id} disabled={saving} inputProps={{ 'aria-label': `Select ${project.name}` }} /></label>)}</RadioGroup>
      </section>
      {projectId && <section className="dashboard-picker-step"><Text component="h3">2. Dashboard</Text><TextField fullWidth label="Search dashboards" value={dashboardSearch} onChange={event => setDashboardSearch(event.target.value)} />
        {creatingDashboard ? <div className="project-create-inline"><TextField autoFocus fullWidth label="Dashboard name" value={dashboardName} onChange={event => setDashboardName(event.target.value)} /><Button color="neutral" variant="outlined" disabled={!dashboardName.trim() || saving} onClick={() => void createDashboard()}>Create dashboard</Button><Button color="neutral" variant="text" disabled={saving} onClick={() => setCreatingDashboard(false)}>Cancel</Button></div> : <Button color="neutral" variant="text" startIcon={PlusMd} disabled={saving} onClick={() => setCreatingDashboard(true)}>Create dashboard</Button>}
        {dashboards.length ? <RadioGroup aria-label="Choose dashboard" name="dashboard-picker" value={dashboardId ?? ''} onChange={event => { setDashboardId((event.target as HTMLInputElement).value); setError('') }} className="project-picker-list">{dashboards.map(dashboard => { const alreadyAdded = !!artifact && dashboard.widgets.some(widget => widget.artifactId === artifact.id); return <label key={dashboard.id} className={`project-picker-row ${alreadyAdded ? 'is-disabled' : ''} ${dashboardId === dashboard.id ? 'is-selected' : ''}`}><span className="project-picker-copy"><Text>{dashboard.title}</Text><Text>{dashboard.widgets.length} widgets{alreadyAdded ? ' · Already added' : ''}</Text></span><Radio value={dashboard.id} disabled={alreadyAdded || saving} inputProps={{ 'aria-label': `Select ${dashboard.title}` }} /></label> })}</RadioGroup> : <Text className="project-picker-empty">No dashboards in this project yet. Create one to continue.</Text>}
      </section>}
      {error && <Alert severity="error">{error}</Alert>}
    </DialogContent>
    <DialogActions><Button color="neutral" variant="outlined" disabled={saving} onClick={onClose}>Cancel</Button><ProgressButton busy={saving} color="primary" label="Add to dashboard" busyLabel="Adding…" disabled={!dashboardId} onClick={() => void add()} /></DialogActions>
  </Dialog>
}
