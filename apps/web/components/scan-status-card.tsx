import Link from "next/link";

import type { ScanSummary } from "@surfaceiq/core";

export function ScanStatusCard({ scan }: { scan: ScanSummary }) {
  return (
    <Link className="scan-card" href={`/scans/${scan.id}`}>
      <div className="button-row">
        <span className={`status-pill ${scan.state}`}>{scan.state}</span>
        <span className="muted">{new Date(scan.createdAt).toLocaleString()}</span>
      </div>
      <h3 className="scan-title">{scan.startUrl}</h3>
      <p className="muted">{scan.lastMessage}</p>
      <div className="meta-line">
        <span>{scan.authMode}</span>
        <span>{scan.pagesDiscovered} pages</span>
        <span>{scan.findingsCount} findings</span>
      </div>
    </Link>
  );
}
