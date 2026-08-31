"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

/**
 * Client-side route guard. Firebase Auth state only exists in the browser, so
 * protected areas gate on it here rather than in middleware. While auth state
 * is resolving we show a neutral placeholder instead of flashing the page.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/sign-in");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-16 text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
