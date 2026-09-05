"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  authErrorMessage,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/lib/services/auth";
import { Alert, Button, Card, TextField } from "@/components/ui";
import { readDraft } from "@/lib/draft-storage";

function postSignInDestination(): string {
  return readDraft() ? "/trips/new" : "/dashboard";
}

type Mode = "sign-in" | "sign-up";

const copy: Record<Mode, { title: string; submit: string; alt: string; altHref: string; altLabel: string }> = {
  "sign-in": {
    title: "Sign in",
    submit: "Sign in",
    alt: "New here?",
    altHref: "/sign-up",
    altLabel: "Create an account",
  },
  "sign-up": {
    title: "Create your account",
    submit: "Create account",
    alt: "Already have an account?",
    altHref: "/sign-in",
    altLabel: "Sign in",
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const t = copy[mode];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "email" | "google">(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy("email");
    try {
      if (mode === "sign-up") {
        await signUpWithEmail(email, password, name.trim() || undefined);
      } else {
        await signInWithEmail(email, password);
      }
      router.replace(postSignInDestination());
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy("google");
    try {
      await signInWithGoogle();
      router.replace(postSignInDestination());
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Card>
      <h1 className="mb-5 text-lg font-semibold">{t.title}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "sign-up" ? (
          <TextField
            id="name"
            label="Name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : null}

        <TextField
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <TextField
          id="password"
          label="Password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={mode === "sign-up" ? "At least 6 characters." : undefined}
        />

        {error ? <Alert>{error}</Alert> : null}

        <Button type="submit" disabled={busy !== null}>
          {busy === "email" ? "Working…" : t.submit}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={handleGoogle}
        disabled={busy !== null}
      >
        {busy === "google" ? "Working…" : "Continue with Google"}
      </Button>

      <p className="mt-5 text-center text-sm text-zinc-500">
        {t.alt}{" "}
        <Link href={t.altHref} className="font-medium text-orange-600 hover:underline">
          {t.altLabel}
        </Link>
      </p>
    </Card>
  );
}
