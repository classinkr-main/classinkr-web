import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextRequest, NextResponse } from "next/server"

const LANDING_SLUGS: Record<string, string> = {
  enterprise: "enterprise",
  bigs: "enterprise",
  managed: "managed",
  medium: "managed",
  kids: "kids",
  online: "online",
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
