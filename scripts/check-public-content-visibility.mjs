import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const ROOT = process.cwd()
const REQUIRED_ARTIFACTS = {
  about: [
    ".next/server/app/about.html",
    ".next/server/app/about.rsc",
    ".next/server/app/about.segments",
  ],
  updates: [
    ".next/server/app/updates.html",
    ".next/server/app/updates.rsc",
    ".next/server/app/updates.segments",
  ],
}

const originalEnv = new Set(Object.keys(process.env))

loadEnvFile(".env")
loadEnvFile(".env.local")

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn("[content-visibility] Supabase server env is missing; skipping public content visibility check.")
  process.exit(0)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const [latestBlog, latestUpdateDoc] = await Promise.all([
  fetchLatestPublishedBlogPost(),
  fetchLatestPublicUpdateDoc(),
])

const aboutText = readArtifacts(REQUIRED_ARTIFACTS.about)
const updatesText = readArtifacts(REQUIRED_ARTIFACTS.updates)

const failures = []

if (!latestBlog) {
  failures.push("No published blog post was found in Supabase.")
} else {
  assertIncludes(aboutText, latestBlog.slug, `latest blog slug on /about (${latestBlog.slug})`)
  assertIncludes(aboutText, latestBlog.title, `latest blog title on /about (${latestBlog.title})`)
}

if (!latestUpdateDoc) {
  failures.push("No public update document was found in Supabase.")
} else {
  const updatePath = `/docs/updates/${latestUpdateDoc.slug}`
  assertIncludes(updatesText, updatePath, `latest update doc link on /updates (${updatePath})`)
  assertIncludes(updatesText, latestUpdateDoc.title, `latest update doc title on /updates (${latestUpdateDoc.title})`)
}

if (failures.length > 0) {
  console.error("[content-visibility] Public content visibility check failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("[content-visibility] Public content visibility check passed.")

function assertIncludes(haystack, needle, label) {
  if (!needle || haystack.includes(needle)) return
  failures.push(`Missing ${label}.`)
}

async function fetchLatestPublishedBlogPost() {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title,published_at,created_at")
    .in("status", ["PUBLISHED", "published"])
    .is("deleted_at", null)
    .or(`published_at.is.null,published_at.lte.${now}`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`[content-visibility] Failed to read latest blog post: ${error.message}`)
  }

  return data?.[0] ?? null
}

async function fetchLatestPublicUpdateDoc() {
  const { data, error } = await supabase
    .from("docs_articles")
    .select("slug,title,last_reviewed_at,published_at,updated_at")
    .eq("category_id", "updates")
    .in("status", ["published", "PUBLISHED"])
    .eq("visibility", "public")
    .eq("noindex", false)

  if (error) {
    throw new Error(`[content-visibility] Failed to read latest update doc: ${error.message}`)
  }

  return (data ?? [])
    .sort((left, right) => docSortTime(right) - docSortTime(left))
    .at(0) ?? null
}

function docSortTime(row) {
  return Date.parse(row.last_reviewed_at ?? row.published_at ?? row.updated_at ?? "") || 0
}

function readArtifacts(entries) {
  return entries.map((entry) => {
    const absolutePath = path.join(ROOT, entry)
    if (!fs.existsSync(absolutePath)) {
      failures.push(`Missing build artifact: ${entry}`)
      return ""
    }

    return readTextRecursive(absolutePath)
  }).join("\n")
}

function readTextRecursive(targetPath) {
  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    return fs.readdirSync(targetPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => readTextRecursive(path.join(targetPath, entry.name)))
      .join("\n")
  }

  return fs.readFileSync(targetPath, "utf8")
}

function loadEnvFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath)
  if (!fs.existsSync(absolutePath)) return

  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue

    const [key, value] = parsed
    if (originalEnv.has(key)) continue
    process.env[key] = value
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return null

  const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed
  const equalsIndex = normalized.indexOf("=")
  if (equalsIndex <= 0) return null

  const key = normalized.slice(0, equalsIndex).trim()
  let value = normalized.slice(equalsIndex + 1).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  } else {
    value = value.replace(/\s+#.*$/, "")
  }

  return [key, value]
}
