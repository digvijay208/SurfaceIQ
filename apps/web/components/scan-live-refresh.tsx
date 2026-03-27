"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ScanLiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }

    const handle = window.setInterval(() => {
      router.refresh();
    }, 4_000);

    return () => window.clearInterval(handle);
  }, [active, router]);

  return null;
}
