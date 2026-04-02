import type { ArtifactStore, ScanRepository } from "./contracts";
import { BlobArtifactStore } from "./blob-artifact-store";
import { FileArtifactStore } from "./file-artifact-store";
import { FileScanRepository } from "./file-scan-repository";
import { PostgresScanRepository } from "./postgres-scan-repository";

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
}

export function createScanRepositoryFromEnv(): ScanRepository {
  const databaseUrl = getDatabaseUrl();
  if (databaseUrl) {
    return new PostgresScanRepository(databaseUrl);
  }

  return new FileScanRepository();
}

export function createArtifactStoreFromEnv(): ArtifactStore {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new BlobArtifactStore(process.env.BLOB_READ_WRITE_TOKEN);
  }

  return new FileArtifactStore();
}
