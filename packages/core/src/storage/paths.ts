import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

function projectRootFrom(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "../../../../");
}

export function getProjectRoot(moduleUrl: string): string {
  return process.env.SURFACEIQ_ROOT ?? projectRootFrom(moduleUrl);
}

export function getDataRoot(moduleUrl: string): string {
  return resolve(getProjectRoot(moduleUrl), ".data");
}

export function getArtifactRoot(moduleUrl: string): string {
  return resolve(getProjectRoot(moduleUrl), ".artifacts");
}
