import type { Artifact, SourceContext } from '../lib/model'

export function followUpIdentity(sourceMessageId: string, index: number): string {
  return `${sourceMessageId}:${index}`
}

export function resolveAdvisorSource(artifact: Artifact, supplied?: SourceContext | null): SourceContext {
  if (supplied?.artifactId === artifact.id) return supplied
  return {
    artifactId: artifact.id,
    datasetId: artifact.datasetId,
    filters: [],
    sourceLabel: artifact.title,
  }
}
