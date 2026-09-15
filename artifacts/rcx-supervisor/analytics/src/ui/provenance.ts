import type { Artifact, Dataset } from '../lib/model'

const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function provenanceItems(artifact: Artifact, _dataset: Dataset): Array<[string, string]> {
  const evidence = artifact.evidence
  if (!evidence) return [['Source', 'Selected dataset']]
  const period = evidence.reference.scope.period
  const generator = evidence.provenance.generatorVersion
  return [
    ['Source', evidence.provenance.synthetic ? 'Generated example' : 'Selected dataset'],
    ['Period', `${date.format(new Date(period.from))} – ${date.format(new Date(period.to))}`],
    ['Definition', generator],
    ...(evidence.limitations.length ? [['Limitations', evidence.limitations.join(' ')]] as Array<[string, string]> : []),
  ]
}
