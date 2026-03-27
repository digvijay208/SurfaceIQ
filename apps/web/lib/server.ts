import { FileArtifactStore, FileScanRepository, sortFindingsBySeverity } from "@surfaceiq/core";

export const scanRepository = new FileScanRepository();
export const artifactStore = new FileArtifactStore();

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
