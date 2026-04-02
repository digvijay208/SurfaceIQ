import { get, put } from "@vercel/blob";

import type { ArtifactKind, ArtifactRecord } from "../types";
import type { ArtifactStore } from "./contracts";
import { makeId, nowIso } from "../utils";

export class BlobArtifactStore implements ArtifactStore {
  constructor(private readonly token = process.env.BLOB_READ_WRITE_TOKEN) {}

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

    await put(artifact.relativePath, input.text, {
      access: "private",
      addRandomSuffix: false,
      contentType: input.mimeType,
      ...(this.token ? { token: this.token } : {})
    });

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

    await put(artifact.relativePath, input.data, {
      access: "private",
      addRandomSuffix: false,
      contentType: input.mimeType,
      ...(this.token ? { token: this.token } : {})
    });

    return artifact;
  }

  async readArtifact(record: ArtifactRecord): Promise<Buffer> {
    const result = await get(record.relativePath, {
      access: "private",
      ...(this.token ? { token: this.token } : {})
    });

    if (!result) {
      throw new Error(`Artifact ${record.id} is missing from blob storage.`);
    }

    const body = await new Response(result.stream).arrayBuffer();
    return Buffer.from(body);
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
      relativePath: `${input.scanId}/${filename}`,
      createdAt: nowIso(),
      ...(input.pageId ? { pageId: input.pageId } : {})
    };
  }
}
