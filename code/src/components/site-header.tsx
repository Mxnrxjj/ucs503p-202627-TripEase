"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { signOutUser } from "@/lib/services/auth";
import { Button } from "@/components/ui";

export function SiteHeader() {
  const { user } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutUser();
      router.replace("/sign-in");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          Trip<span className="text-sky-700">Ease</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden text-zinc-500 sm:inline">
                {user.displayName || user.email}
              </span>
              <Button
                variant="secondary"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
