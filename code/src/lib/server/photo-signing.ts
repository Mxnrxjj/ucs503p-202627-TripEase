import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Photo URLs are signed rather than bearer-authenticated.
 *
 * `/api/places/photo` is loaded by the browser as an `<img src>`, which can't
 * carry an Authorization header — so the usual token check doesn't apply. The
 * server instead signs each photo reference when it builds the URL, and only
 * serves references carrying a valid signature. A stranger therefore can't
 * mint arbitrary photo requests against the project's Places quota; they can
 * only replay URLs the server already issued.
 *
 * The signing secret never leaves the server and is never the Places key
 * itself — it's an HMAC *of* it, so the key can't be recovered from a
 * signature. Setting PHOTO_URL_SECRET explicitly is preferred.
 */
function signingSecret(): string | null {
  const explicit = process.env.PHOTO_URL_SECRET;
  if (explicit) return explicit;

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return null;
  return createHmac("sha256", "tripease-photo-url").update(placesKey).digest("hex");
}

export function signPhotoName(name: string): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(name).digest("hex").slice(0, 32);
}

export function verifyPhotoSignature(name: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = signPhotoName(name);
  if (!expected) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
