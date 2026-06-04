import { readFile } from "node:fs/promises"
import { join } from "node:path"

const landingPath = join(process.cwd(), "public", "l", "omo1", "index.html")
const baseTag = '<base href="/l/omo1/" />'

export const runtime = "nodejs"

function addBaseTag(html: string) {
  if (html.includes("<base ")) return html
  return html.replace("<head>", `<head>\n${baseTag}`)
}

export async function GET() {
  const html = await readFile(landingPath, "utf8")

  return new Response(addBaseTag(html), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
