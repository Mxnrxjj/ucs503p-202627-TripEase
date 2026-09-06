import type { NextConfig } from "next";

/**
 * Guard against publishing a server-side secret to the browser.
 *
 * `NEXT_PUBLIC_*` values are inlined into client JavaScript by design, so
 * anything set there is public. `GOOGLE_PLACES_API_KEY` and `GROQ_API_KEY` are
 * not: they are read only in server routes, and copying one into a
 * `NEXT_PUBLIC_` variable would hand it to every visitor with nothing else in
 * the stack complaining. That mistake was made once during the Google Maps
 * experiment, so it is checked at build time.
 *
 * It compares values and never prints them.
 */
const SERVER_ONLY_SECRETS = ["GOOGLE_PLACES_API_KEY", "GROQ_API_KEY", "PHOTO_URL_SECRET"];

function assertNoServerSecretIsPublic(): void {
  const secrets: { name: string; value: string }[] = [];
  for (const name of SERVER_ONLY_SECRETS) {
    const value = process.env[name]?.trim();
    if (value) secrets.push({ name, value });
  }
  if (secrets.length === 0) return;

  for (const [publicName, rawValue] of Object.entries(process.env)) {
    if (!publicName.startsWith("NEXT_PUBLIC_")) continue;
    const value = rawValue?.trim();
    if (!value) continue;

    const match = secrets.find((secret) => secret.value === value);
    if (match) {
      console.warn(
        `\n[security] ${publicName} has the same value as ${match.name}.\n` +
          `           NEXT_PUBLIC_* variables are compiled into client JavaScript, so this\n` +
          `           publishes a server-side secret to every visitor. Use a different value.\n`,
      );
    }
  }
}

assertNoServerSecretIsPublic();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
