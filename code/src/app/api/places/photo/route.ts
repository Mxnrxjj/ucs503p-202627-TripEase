import { NextRequest, NextResponse } from "next/server";
import { verifyPhotoSignature } from "@/lib/server/photo-signing";

/**
 * GET /api/places/photo?name=places/PLACE_ID/photos/PHOTO_ID&sig=...
 *
 * The Google Places `google-provider.ts` never puts a raw Google photo URL
 * (which would need `?key=...` attached) into a `Place.imageUrl` — it puts
 * a relative link to this route instead. This route is the only place that
 * attaches the API key to a photo request, and it does so server-side: the
 * image bytes are streamed back to the browser, but the key itself never
 * appears in any response the client can inspect.
 *
 * Browsers can't send an Authorization header for an `<img src>`, so instead
 * of a bearer token this route requires the HMAC signature the server issued
 * alongside the photo name (see `lib/server/photo-signing.ts`). That stops
 * arbitrary photo requests being made against the project's quota.
 */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const signature = request.nextUrl.searchParams.get("sig");
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!name || !name.startsWith("places/")) {
    return NextResponse.json({ error: "Invalid photo reference." }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "Places photos are not configured." }, { status: 404 });
  }
  if (!verifyPhotoSignature(name, signature)) {
    return NextResponse.json({ error: "This photo link isn't valid." }, { status: 403 });
  }

  const upstreamUrl = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${apiKey}`;

  try {
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Couldn't load this image." }, { status: 502 });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Places photo proxy failed", error);
    return NextResponse.json({ error: "Couldn't load this image." }, { status: 502 });
  }
}
