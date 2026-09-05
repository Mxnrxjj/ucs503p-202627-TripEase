"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
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
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/dashboard" className="font-display text-lg font-semibold tracking-tight">
          Trip<span className="text-orange-600">Ease</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/trips/new" className="hidden sm:block">
                <Button size="sm" variant="outline">
                  <Plus className="h-3.5 w-3.5" />
                  New trip
                </Button>
              </Link>
              <span className="hidden text-zinc-500 lg:inline">
                {user.displayName || user.email}
              </span>
              <Button
                variant="secondary"
                size="sm"
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
