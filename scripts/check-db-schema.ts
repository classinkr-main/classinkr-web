/**
 * 프로덕션 DB가 repo 마이그레이션까지 최신인지 확인한다.
 *
 * 실행:
 *   npm run check:db              # .env.local 자동 로드
 *   npx tsx scripts/check-db-schema.ts --strict
 *
 * --strict 는 데이터 이관 경고(warning)도 실패로 취급한다.
 * 계약(무엇을 검사할지)은 lib/db/schema-contract.ts — 새 마이그레이션은 거기에 프로브를 추가한다.
 *
 * 이 스크립트는 읽기 전용이다. RPC 프로브도 존재하지 않는 id로 호출해 0행 UPDATE만 낸다.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  SCHEMA_CONTRACT_MIGRATIONS,
  SCHEMA_PROBES,
  isMissingColumnMessage,
  isMissingTableMessage,
  probeName,
  summarizeSchemaProbes,
  type SchemaProbeResult,
} from "../lib/db/schema-contract"

const args = new Set(process.argv.slice(2))
const strict = args.has("--strict")

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

/** 오류 메시지를 운영자가 바로 행동할 수 있는 한 줄로 바꾼다. */
function explain(message: string): string {
  if (isMissingTableMessage(message)) return `테이블 없음 — ${message}`
  if (isMissingColumnMessage(message)) return `컬럼 없음 — ${message}`
  return message
}

async function main() {
  loadEnvLocal()

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_SECRET_KEY")

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // anon 프로브용 — RLS가 실제로 막는지 확인하려면 service role이 아니라 공개 키로 물어야 한다.
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    null
  const anonClient = anonKey
    ? createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null

  console.log("[check:db] 계약이 검증하는 마이그레이션")
  for (const migration of SCHEMA_CONTRACT_MIGRATIONS) console.log(`  - ${migration}`)

  const results: SchemaProbeResult[] = []

  for (const probe of SCHEMA_PROBES) {
    const base = {
      name: probeName(probe),
      label: probe.label,
      migration: probe.migration,
      severity: probe.severity ?? ("blocker" as const),
      impact: probe.impact,
    }

    if (probe.kind === "table") {
      const { count, error } = await supabase
        .from(probe.table)
        .select(probe.columns.join(","), { count: "exact", head: true })

      results.push({
        ...base,
        count: error ? null : count ?? 0,
        error: error ? explain(error.message) : null,
        minimumRows: probe.minimumRows,
        seedCommand: probe.seedCommand,
      })
      continue
    }

    if (probe.kind === "rpc") {
      const { error } = await supabase.rpc(probe.functionName, probe.args)
      results.push({ ...base, count: null, error: error ? explain(error.message) : null })
      continue
    }

    // anon 프로브 — 금지 대상 행을 service role과 anon 양쪽에서 세어 비교한다.
    if (!anonClient) {
      results.push({ ...base, count: null, error: null, skipped: true })
      continue
    }

    // 금지 대상 필터를 양쪽 클라이언트에 같은 방식으로 건다.
    // (제네릭 헬퍼는 PostgREST 빌더 타입이 너무 깊어 TS2589가 나므로 인라인으로 분기한다.)
    const countForbidden = async (client: SupabaseClient) => {
      const query = client.from(probe.table).select("*", { count: "exact", head: true })
      if (!probe.forbidden) return query
      const { operator, column, value } = probe.forbidden
      return operator === "eq" ? query.eq(column, value) : query.neq(column, value)
    }

    const admin = await countForbidden(supabase)
    if (admin.error) {
      results.push({ ...base, count: null, error: explain(admin.error.message) })
      continue
    }

    const anon = await countForbidden(anonClient)
    // RLS deny-all 은 오류가 아니라 빈 결과로 돌아온다. 권한 오류도 차단으로 친다.
    results.push({
      ...base,
      count: null,
      error: null,
      anonVisibleRows: anon.error ? 0 : anon.count ?? 0,
      forbiddenRowsExist: admin.count ?? 0,
    })
  }

  const summary = summarizeSchemaProbes(results)

  console.log("\n[check:db] 프로브 결과")
  for (const result of results) {
    if (result.error) {
      console.log(`  x ${result.name} (${result.label}): ${result.error}`)
      continue
    }
    if (result.skipped) {
      console.log(`  - ${result.name} (${result.label}): anon 키 없음 — 건너뜀`)
      continue
    }
    if (result.anonVisibleRows !== undefined) {
      const verdict =
        result.anonVisibleRows > 0
          ? `anon 노출 ${result.anonVisibleRows}건`
          : result.forbiddenRowsExist
            ? `차단 확인(대상 ${result.forbiddenRowsExist}건 중 anon 0건)`
            : "검증 불가(대상 0건)"
      console.log(`  ${result.anonVisibleRows > 0 ? "x" : "✓"} ${result.name} (${result.label}): ${verdict}`)
      continue
    }
    const rows = result.count === null ? "호출 가능" : `rows=${result.count}`
    console.log(`  ✓ ${result.name} (${result.label}): ${rows}`)
  }

  if (summary.warning.length > 0) {
    console.log("\n[check:db] 경고 — 스키마는 맞고 데이터가 남았습니다")
    for (const issue of summary.warning) {
      console.log(`  ! ${issue.name}: ${issue.message}`)
      console.log(`      → ${issue.remedy}`)
      if (issue.impact) console.log(`      영향: ${issue.impact}`)
    }
  }

  if (summary.blocked.length > 0) {
    console.log("\n[check:db] 미적용 마이그레이션")
    for (const issue of summary.blocked) {
      console.log(`  x ${issue.name}: ${issue.message}`)
      console.log(`      → ${issue.remedy}`)
      if (issue.impact) console.log(`      영향: ${issue.impact}`)
    }
    process.exitCode = 1
    return
  }

  if (strict && summary.warning.length > 0) {
    process.exitCode = 1
    return
  }

  console.log(
    summary.status === "ok"
      ? "\n[check:db] DB가 repo 마이그레이션까지 최신입니다."
      : "\n[check:db] 스키마는 최신이나 데이터 이관이 남았습니다(--strict 면 실패)."
  )
}

main().catch((error) => {
  console.error("[check:db]", error instanceof Error ? error.message : error)
  process.exit(1)
})
