import {
  createArtifactStoreFromEnv,
  createScanRepositoryFromEnv,
  sortFindingsBySeverity
} from "@surfaceiq/core";

export const scanRepository = createScanRepositoryFromEnv();
export const artifactStore = createArtifactStoreFromEnv();

export async function getSortedScanDetail(scanId: string, userId: string) {
  const detail = await scanRepository.getScanDetailForUser(scanId, userId);
  if (!detail) {
    return null;
  }

  return {
    ...detail,
    findings: sortFindingsBySeverity(detail.findings)
  };
}
