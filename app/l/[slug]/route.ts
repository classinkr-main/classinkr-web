import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextRequest, NextResponse } from "next/server"

const LANDING_SLUGS: Record<string, string> = {
  enterprise: "enterprise",
  bigs: "enterprise",
  landing_bigs: "enterprise",
  "landing-bigs": "enterprise",
  managed: "managed",
  medium: "managed",
  landing_medium: "managed",
  "landing-medium": "managed",
  kids: "kids",
  landing_kids: "kids",
  "landing-kids": "kids",
  online: "online",
  landing_online: "online",
  "landing-online": "online",
  "meets-july": "meets-july",
  meets: "meets-july",
  meets7: "meets-july",
  meets_july: "meets-july",
  "0730-31": "meets-july",
  "0730_31": "meets-july",
  landing_meets: "meets-july",
  "landing-meets": "meets-july",
}

export const runtime = "nodejs"

function addBaseTag(html: string, slug: string) {
  if (html.includes("<base ")) return html
  return html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="/l/${slug}/" />`)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const landingSlug = LANDING_SLUGS[slug]

  if (!landingSlug) {
    return new Response("Landing not found", { status: 404 })
  }

  if (landingSlug !== slug) {
    const url = new URL(request.url)
    url.pathname = `/l/${landingSlug}`
    return NextResponse.redirect(url, 308)
  }

  const landingPath = join(process.cwd(), "public", "l", landingSlug, "index.html")
  let html: string
  try {
    html = await readFile(landingPath, "utf8")
  } catch {
    return new Response("Landing not found", { status: 404 })
  }

  return new Response(addBaseTag(html, landingSlug), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
