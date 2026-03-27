"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="ghost-button"
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          void (async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
            router.refresh();
          })();
        })
      }
      type="button"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
