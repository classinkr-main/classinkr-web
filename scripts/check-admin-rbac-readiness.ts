import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

const WANGCHAN_NEO_OWNER_ID = "3637154579422025"
const WANGCHAN_NAMES = new Set(["이왕찬", "왕찬", "leewangchan", "wangchan", "wangchanlee"])
const verbose = process.argv.includes("--verbose")

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

function requiredEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  throw new Error(`Missing one of: ${names.join(", ")}`)
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/\s+/g, "")
}

async function main() {
  loadEnvLocal()
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
  const key = requiredEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let migrationReady = true
  let result = await supabase
    .from("admin_profiles")
    .select("user_id,display_name,role,status,crm_team_role,neo_owner_id,capabilities")
    .order("display_name")

  if (result.error) {
    if (!result.error.message.includes("capabilities")) {
      throw new Error(`[admin-rbac] profile query failed: ${result.error.message}`)
    }
    migrationReady = false
    const fallback = await supabase
      .from("admin_profiles")
      .select("user_id,display_name,role,status,crm_team_role,neo_owner_id")
      .order("display_name")
    if (fallback.error) throw new Error(`[admin-rbac] profile query failed: ${fallback.error.message}`)
    result = {
      data: (fallback.data ?? []).map((row) => ({ ...row, capabilities: [] as string[] })),
      error: null,
      count: fallback.count,
      status: fallback.status,
      statusText: fallback.statusText,
    }
  }

  const rows = result.data ?? []
  const activeRows = rows.filter((row) => row.status === "ACTIVE")
  const roleCounts = activeRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.role] = (counts[row.role] ?? 0) + 1
    return counts
  }, {})
  const superAdmins = rows.filter((row) => row.status === "ACTIVE" && row.role === "SUPER_ADMIN")
  const wangchan = rows.filter((row) =>
    row.status === "ACTIVE" &&
    (row.neo_owner_id === WANGCHAN_NEO_OWNER_ID || WANGCHAN_NAMES.has(normalizedName(row.display_name)))
  )
  const finalizers = rows.filter((row) =>
    Array.isArray(row.capabilities) && row.capabilities.includes("hardware.finalize")
  )

  console.log(`[admin-rbac] active profiles=${activeRows.length}`)
  console.log(`[admin-rbac] roles=${Object.entries(roleCounts).map(([role, count]) => `${role}:${count}`).join(", ")}`)
  if (verbose) {
    console.log(`[admin-rbac] profiles=${activeRows.map((row) => `${row.display_name}(${row.role}/${row.crm_team_role})`).join(", ")}`)
  }
  console.log(`[admin-rbac] migration=${migrationReady ? "ready" : "missing capabilities column"}`)
  console.log(`[admin-rbac] SUPER_ADMIN=${superAdmins.length}: ${superAdmins.map((row) => row.display_name).join(", ") || "none"}`)
  console.log(`[admin-rbac] Wangchan candidates=${wangchan.length}: ${wangchan.map((row) => row.display_name).join(", ") || "none"}`)
  console.log(`[admin-rbac] hardware.finalize=${finalizers.length}: ${finalizers.map((row) => row.display_name).join(", ") || "none"}`)

  if (!migrationReady || superAdmins.length !== 1 || wangchan.length !== 1 || finalizers.length !== 1 || finalizers[0]?.user_id !== wangchan[0]?.user_id) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
