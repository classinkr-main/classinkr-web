/**
 * Check the Supabase DB contract required for chatbot/docs alpha launch.
 *
 * Usage:
 *   npx tsx scripts/check-alpha-db.ts
 *   npx tsx scripts/check-alpha-db.ts --strict
 *
 * --strict exits non-zero for launch-data warnings as well as schema blockers.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

import {
  ALPHA_DB_MIGRATIONS,
  ALPHA_DB_RPC_PROBES,
  ALPHA_DB_TABLE_PROBES,
  buildAlphaDbProbeSelect,
  summarizeAlphaDbProbeResults,
  type AlphaDbProbeResult,
} from "../lib/chatbot/alpha-db-contract"

const args = new Set(process.argv.slice(2))
const strict = args.has("--strict")

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return

  const envText = readFileSync(envPath, "utf8")
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue

    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main() {
  loadEnvLocal()

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_SECRET_KEY")

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log("[alpha-db] Required migrations")
  for (const migration of ALPHA_DB_MIGRATIONS) {
    console.log(`  - ${migration}`)
  }

  const results: AlphaDbProbeResult[] = []

  for (const probe of ALPHA_DB_TABLE_PROBES) {
    const { count, error } = await supabase
      .from(probe.table)
      .select(buildAlphaDbProbeSelect(probe), { count: "exact", head: true })

    results.push({
      table: probe.table,
      label: probe.label,
      count: error ? null : count ?? 0,
      error: error?.message ?? null,
      minimumRows: probe.minimumRows,
      migration: probe.migration,
    })
  }

  for (const probe of ALPHA_DB_RPC_PROBES) {
    const { error } = await supabase.rpc(probe.functionName, probe.args)

    results.push({
      table: probe.functionName,
      label: probe.label,
      count: error ? null : 1,
      error: error?.message ?? null,
      migration: probe.migration,
    })
  }

  const summary = summarizeAlphaDbProbeResults(results)

  console.log("\n[alpha-db] Probe results")
  for (const result of results) {
    if (result.error) {
      console.log(`  x ${result.table} (${result.label}): ${result.error}`)
      continue
    }

    const minimum = result.minimumRows ? ` / min ${result.minimumRows}` : ""
    console.log(`  ✓ ${result.table} (${result.label}): rows=${result.count ?? 0}${minimum}`)
  }

  if (summary.warning.length > 0) {
    console.log("\n[alpha-db] Launch-data warnings")
    for (const issue of summary.warning) {
      console.log(`  ! ${issue.table}: ${issue.message}${issue.migration ? ` (${issue.migration})` : ""}`)
    }
  }

  if (summary.blocked.length > 0) {
    console.log("\n[alpha-db] Schema blockers")
    for (const issue of summary.blocked) {
      console.log(`  x ${issue.table}: ${issue.message}${issue.migration ? ` (${issue.migration})` : ""}`)
    }
    process.exitCode = 1
    return
  }

  if (strict && summary.warning.length > 0) {
    process.exitCode = 1
    return
  }

  console.log(`\n[alpha-db] Status: ${summary.status}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
