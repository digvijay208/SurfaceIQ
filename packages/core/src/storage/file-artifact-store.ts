import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ArtifactKind, ArtifactRecord } from "../types";
import { makeId, nowIso } from "../utils";
import { getArtifactRoot } from "./paths";

export class FileArtifactStore {
  private readonly artifactRoot = getArtifactRoot(import.meta.url);

  async writeTextArtifact(input: {
    scanId: string;
    pageId?: string;
    kind: ArtifactKind;
    label: string;
    extension: string;
    mimeType: string;
    text: string;
  }): Promise<ArtifactRecord> {
    const artifact = this.createArtifactRecord({
      scanId: input.scanId,
      kind: input.kind,
      label: input.label,
      extension: input.extension,
      mimeType: input.mimeType,
      ...(input.pageId ? { pageId: input.pageId } : {})
    });

    await mkdir(join(this.artifactRoot, input.scanId), { recursive: true });
    await writeFile(join(this.artifactRoot, artifact.relativePath), input.text, "utf8");

    return artifact;
  }

  async writeBinaryArtifact(input: {
    scanId: string;
    pageId?: string;
    kind: ArtifactKind;
    label: string;
    extension: string;
    mimeType: string;
    data: Buffer;
  }): Promise<ArtifactRecord> {
    const artifact = this.createArtifactRecord({
      scanId: input.scanId,
      kind: input.kind,
      label: input.label,
      extension: input.extension,
      mimeType: input.mimeType,
      ...(input.pageId ? { pageId: input.pageId } : {})
    });

    await mkdir(join(this.artifactRoot, input.scanId), { recursive: true });
    await writeFile(join(this.artifactRoot, artifact.relativePath), input.data);

    return artifact;
  }

  async readArtifact(record: ArtifactRecord): Promise<Buffer> {
    return readFile(join(this.artifactRoot, record.relativePath));
  }

  private createArtifactRecord(input: {
    scanId: string;
    pageId?: string;
    kind: ArtifactKind;
    label: string;
    extension: string;
    mimeType: string;
  }): ArtifactRecord {
    const id = makeId("artifact");
    const filename = `${id}.${input.extension}`;

    return {
      id,
      scanId: input.scanId,
      kind: input.kind,
      label: input.label,
      mimeType: input.mimeType,
      relativePath: join(input.scanId, filename),
      createdAt: nowIso(),
      ...(input.pageId ? { pageId: input.pageId } : {})
    };
  }
}
