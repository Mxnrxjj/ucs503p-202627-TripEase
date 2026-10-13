# Week 1 : Protecting the API Routes and the Data, and the Firebase Layer

# Security and the Firebase Layer

## Issue

The API routes that call outside services (city planning, itinerary
generation, place search) spend money and quota. Anyone who could call them
could use up the project's Places and AI quota. At the same time the app has
no separate backend, so the database itself had to protect each user's trips.

## Cause

- A route handler accepts any request unless it checks who is calling.
- Firestore with default rules lets any client read and write.
- The usual way to verify a Firebase login on a server is the Firebase Admin
  SDK. That needs a service-account private key, which is one more long-lived
  secret to keep safe, and an earlier key in this project had already ended
  up in the wrong file.

## Fix

**1. Verify the ID token ourselves.** A Firebase ID token is an RS256 JWT
signed by Google. `lib/server/firebase-auth.ts` verifies it with `jose`
against Google's public keys (`createRemoteJWKSet`, which caches the keys).
It checks the issuer, the audience (our project id) and the algorithm. This
needs no secret at all.

- `requireUser` reads the `Authorization: Bearer ...` header on every route.
- If the server is not configured, it fails closed with 500 and never lets
  the request through.
- When a token is bad, the reply is always the same, "Invalid or expired
  session". The reason is hidden on purpose, because a detailed reason helps
  someone who is probing the endpoint.

**2. Signed photo links.** The browser loads place photos with `<img src>`,
which cannot send a bearer header. Each photo link carries an HMAC signature
that the server created, and `/api/places/photo` serves only links with a
valid signature (compared with `timingSafeEqual`). The Places API key is
added only on the server and never appears in a response.

**3. Firestore rules that deny by default.** A trip can be read only by its
owner. On create the caller must write their own uid as `ownerId`, and
`ownerId` cannot be changed later. Anything not matched is denied.

**4. The browser side.** `lib/api-client.ts` has one function,
`postAuthenticated`, which every call to a protected route uses. It takes the
current user's ID token from the Firebase SDK, which refreshes it when needed,
and sends it in the `Authorization` header. The token is never stored or
logged. If nobody is signed in, the call fails at once with a 401 message. A
network failure and a failed reply each give a readable message, and the
server's own `error` text is used when there is one.

**5. One module for sign-in.** `lib/services/auth.ts` is the only place that
calls Firebase Auth (email sign-up and sign-in, Google sign-in, sign-out and
the listener for the sign-in state). If the identity provider ever changes,
only this file changes. `authErrorMessage` turns Firebase error codes (wrong
password, existing email, closed popup, network error and so on) into
messages for the user. An unknown code gives a generic message, and only in
development the raw code is added so that a wrong configuration can be found.

**6. Firebase set-up that survives a missing configuration.**
`lib/firebase.ts` reads the `NEXT_PUBLIC_*` values. If they are missing, for
example in CI where there are no secrets, the Firebase SDK would throw while
the pages are being prepared and the build would fail. So the file uses a
placeholder configuration, and the browser console shows a clear error. A
`getApps()` check stops a second initialisation when Next.js reloads the
module during development. With `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` the
app connects to the local Auth and Firestore emulators, and only on the first
initialisation, because connecting twice throws.

## Trade-off

Without the Admin SDK the server cannot see that a token was revoked. A token
of a signed-out or disabled account stays valid until it expires, which is at
most one hour. For this app the threat is a stranger using up quota, so this
window is acceptable. The code comment says that anything that needs instant
revocation should move to the Admin SDK.

## Checks

The rules are tested with the Firestore emulator (11 tests in
`tests/rules/`). The CI also has a separate job that scans the repository
for secrets (gitleaks).
