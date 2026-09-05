import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse } from "next/server";

/**
 * Server-side verification of Firebase ID tokens.
 *
 * Firebase ID tokens are ordinary RS256 JWTs signed by Google, so they can be
 * verified against Google's published public keys — which is what this does.
 * The alternative, the Firebase Admin SDK, would mean provisioning and storing
 * a service-account private key: a second long-lived secret to manage, in a
 * project that has already had one key end up in the wrong file. This approach
 * needs no secret at all (the project id it checks against is public), and
 * pulls in one small dependency instead of the Admin SDK's tree.
 *
 * The tradeoff, and it's a real one: without the Admin SDK we can't check
 * whether a token has been *revoked* (a signed-out or disabled account's token
 * stays valid until it expires, up to an hour). For this app's threat model —
 * stopping strangers from spending the project's Places/LLM quota — that's an
 * acceptable window. Anything that needs immediate revocation should move to
 * the Admin SDK.
 */

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// createRemoteJWKSet caches keys and refetches on rotation, so this is a
// module-level singleton rather than a per-request fetch.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export interface AuthedUser {
  uid: string;
  email: string | null;
}

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403 | 500,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function projectId(): string {
  const id = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!id) {
    // A misconfigured server must fail closed, never fall through to "allow".
    throw new AuthError(500, "Authentication is not configured on the server.");
  }
  return id;
}

export async function verifyIdToken(token: string): Promise<AuthedUser> {
  const id = projectId();

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${id}`,
      audience: id,
      algorithms: ["RS256"],
    }));
  } catch {
    // Deliberately opaque: the reason a token failed (expired vs. wrong
    // audience vs. bad signature) is not something a caller needs, and
    // spelling it out helps someone probing the endpoint.
    throw new AuthError(401, "Invalid or expired session.");
  }

  const uid = typeof payload.sub === "string" ? payload.sub : "";
  if (!uid) {
    throw new AuthError(401, "Invalid or expired session.");
  }

  return { uid, email: typeof payload.email === "string" ? payload.email : null };
}

/**
 * Pull the bearer token off a request and verify it. Throws `AuthError`, which
 * `authErrorResponse` turns into the right status code.
 */
export async function requireUser(request: Request): Promise<AuthedUser> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError(401, "Sign in to use this feature.");
  }
  return verifyIdToken(token);
}

/** Turns an AuthError (or anything unexpected) into a safe JSON response. */
export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[auth] unexpected verification failure", error);
  return NextResponse.json({ error: "Could not verify your session." }, { status: 500 });
}
