// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError, requireUser } from "@/lib/server/firebase-auth";

const originalProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

beforeAll(() => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "tripease-test";
});

afterAll(() => {
  if (originalProjectId === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  else process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = originalProjectId;
});

/**
 * These cover the paths that must reject *before* any network call to
 * Google's key endpoint — a missing or malformed Authorization header should
 * never reach token verification, let alone the paid routes behind it.
 */
function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/trips/generate", { method: "POST", headers });
}

describe("requireUser", () => {
  it("rejects a request with no Authorization header", async () => {
    await expect(requireUser(requestWith())).rejects.toBeInstanceOf(AuthError);
    await expect(requireUser(requestWith())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a non-bearer scheme", async () => {
    await expect(requireUser(requestWith({ authorization: "Basic abc123" }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects a bearer header with no token", async () => {
    await expect(requireUser(requestWith({ authorization: "Bearer" }))).rejects.toMatchObject({
      status: 401,
    });
    await expect(requireUser(requestWith({ authorization: "Bearer " }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects a token that isn't a valid signed JWT", async () => {
    await expect(
      requireUser(requestWith({ authorization: "Bearer not-a-real-token" })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("does not leak why verification failed", async () => {
    // The message a caller sees must not distinguish "expired" from "forged".
    await expect(
      requireUser(requestWith({ authorization: "Bearer not-a-real-token" })),
    ).rejects.toMatchObject({ message: "Invalid or expired session." });
  });

  it("fails closed when the server isn't configured", async () => {
    const saved = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    try {
      // A misconfigured deployment must refuse the request, never wave it through.
      await expect(
        requireUser(requestWith({ authorization: "Bearer anything" })),
      ).rejects.toMatchObject({ status: 500 });
    } finally {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = saved;
    }
  });
});
