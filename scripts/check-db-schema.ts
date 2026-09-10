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

function projectRefFromUrl(url: string): string | null {
  const configured = process.env.SUPABASE_PROJECT_REF?.trim()
  if (configured) return configured

  try {
    const [projectRef] = new URL(url).hostname.split(".")
    return projectRef || null
  } catch {
    return null
  }
}

/**
 * 행이 없는 deny-all 테이블은 REST 결과만으로 RLS를 증명할 수 없다.
 * 로컬에 Management API 토큰이 있을 때 pg_class/pg_policies를 읽기 전용으로 확인한다.
 */
async function inspectDenyAllMetadata(url: string, table: string) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  const projectRef = projectRefFromUrl(url)
  if (!accessToken || !projectRef || !/^[a-z0-9_]+$/i.test(table)) return null

  const sql = `
    select
      c.relrowsecurity as rls_enabled,
      (
        select count(*)::int
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = '${table}'
          and p.cmd in ('SELECT', 'ALL')
          and p.roles && array['public', 'anon']::name[]
      ) as anon_select_policy_count,
      (
        select count(*)::int
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = '${table}'
          and p.cmd in ('SELECT', 'ALL')
          and p.roles && array['public', 'anon']::name[]
          and regexp_replace(coalesce(p.qual, ''), '\\s', '', 'g')
            in ('is_active_admin()', 'public.is_active_admin()')
      ) as admin_only_policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = '${table}'
    limit 1
  `

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!response.ok) return null

    const rows = await response.json() as Array<{
      rls_enabled?: boolean | string
      anon_select_policy_count?: number | string
      admin_only_policy_count?: number | string
    }>
    const row = rows[0]
    if (!row) return { protected: false, evidence: "테이블 메타데이터 없음" }

    const rlsEnabled = row.rls_enabled === true || row.rls_enabled === "true"
    const policyCount = Number(row.anon_select_policy_count ?? 0)
    const adminOnlyPolicyCount = Number(row.admin_only_policy_count ?? 0)
    let anonIsActiveAdmin = false

    if (policyCount > 0 && adminOnlyPolicyCount === policyCount) {
      const roleResponse = await fetch(
        `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          // SET LOCAL은 트랜잭션 안에서만 적용되고, SELECT 결과 외 DB 상태를 바꾸지 않는다.
          body: JSON.stringify({
            query: "begin; set local role anon; select public.is_active_admin() as active_admin; rollback;",
          }),
          signal: AbortSignal.timeout(10_000),
        }
      )
      if (!roleResponse.ok) return null
      const roleRows = await roleResponse.json() as Array<{ active_admin?: boolean | string }>
      anonIsActiveAdmin = roleRows[0]?.active_admin === true || roleRows[0]?.active_admin === "true"
    }

    const policiesAreDenyAll = policyCount === 0 || (
      adminOnlyPolicyCount === policyCount && !anonIsActiveAdmin
    )
    return {
      protected: rlsEnabled && policiesAreDenyAll,
      evidence: policyCount === 0
        ? `RLS ${rlsEnabled ? "ON" : "OFF"}, anon/public SELECT 정책 0개`
        : `RLS ${rlsEnabled ? "ON" : "OFF"}, 관리자 전용 정책 ${adminOnlyPolicyCount}/${policyCount}개, anon 관리자=${anonIsActiveAdmin}`,
    }
  } catch {
    return null
  }
}

/** 잠금/쓰기 RPC는 실행하지 않고 pg_proc 시그니처와 EXECUTE 권한만 확인한다. */
async function inspectRpcMetadata(
  url: string,
  functionName: string,
  identityTypes: string,
  serviceRoleOnly: boolean
) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  const projectRef = projectRefFromUrl(url)
  if (
    !accessToken ||
    !projectRef ||
    !/^[a-z0-9_]+$/i.test(functionName) ||
    !/^[a-z0-9_[\], ]+$/i.test(identityTypes)
  ) {
    return { error: "SUPABASE_ACCESS_TOKEN이 없어 잠금 RPC 카탈로그를 검증할 수 없습니다." }
  }

  const sql = `
    select
      p.oid::regprocedure::text as signature,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = '${functionName}'
      and oidvectortypes(p.proargtypes) = '${identityTypes}'
    limit 1
  `

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!response.ok) return { error: `Management API 카탈로그 조회 실패(${response.status})` }

    const rows = await response.json() as Array<{
      signature?: string
      service_execute?: boolean | string
      anon_execute?: boolean | string
      authenticated_execute?: boolean | string
    }>
    const row = rows[0]
    if (!row) return { error: "함수 시그니처가 pg_proc에 없습니다." }

    const enabled = (value: boolean | string | undefined) => value === true || value === "true"
    const serviceExecute = enabled(row.service_execute)
    const anonExecute = enabled(row.anon_execute)
    const authenticatedExecute = enabled(row.authenticated_execute)
    if (!serviceExecute) return { error: "service_role EXECUTE 권한이 없습니다." }
    if (serviceRoleOnly && (anonExecute || authenticatedExecute)) {
      return { error: "anon/authenticated에 내부 쓰기 RPC EXECUTE 권한이 열려 있습니다." }
    }

    return {
      error: null,
      evidence: `${row.signature}; service_role=yes, anon=${anonExecute ? "yes" : "no"}, authenticated=${authenticatedExecute ? "yes" : "no"}`,
    }
  } catch {
    return { error: "Management API 카탈로그 조회가 시간 안에 끝나지 않았습니다." }
  }
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
        // head:true는 PostgREST가 missing-table 본문까지 버려 204/error:null로 보일 수 있다.
        // 실제 1행 GET으로 스키마 오류를 보존하되 payload는 최소화한다.
        .select(probe.columns.join(","), { count: "exact" })
        .range(0, 0)

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
      if (probe.catalogIdentityTypes) {
        const metadata = await inspectRpcMetadata(
          url,
          probe.functionName,
          probe.catalogIdentityTypes,
          probe.serviceRoleOnly === true
        )
        results.push({
          ...base,
          count: null,
          error: metadata.error,
          metadataEvidence: "evidence" in metadata ? metadata.evidence : undefined,
        })
        continue
      }

      const { error } = await supabase.rpc(probe.functionName, probe.args ?? {})
      results.push({
        ...base,
        count: null,
        error: error ? explain(error.message) : null,
      })
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
      const query = client.from(probe.table).select("*", { count: "exact" })
      if (!probe.forbidden) return query.range(0, 0)
      const { operator, column, value } = probe.forbidden
      return operator === "eq"
        ? query.eq(column, value).range(0, 0)
        : query.neq(column, value).range(0, 0)
    }

    const admin = await countForbidden(supabase)
    if (admin.error) {
      results.push({ ...base, count: null, error: explain(admin.error.message) })
      continue
    }

    const anon = await countForbidden(anonClient)
    const forbiddenRowsExist = admin.count ?? 0
    // forbidden 조건이 없는 프로브는 전 행 deny-all 계약이다. 행이 없을 때만 메타데이터로 보강한다.
    const metadata = !probe.forbidden && forbiddenRowsExist === 0
      ? await inspectDenyAllMetadata(url, probe.table)
      : null
    // RLS deny-all 은 오류가 아니라 빈 결과로 돌아온다. 권한 오류도 차단으로 친다.
    results.push({
      ...base,
      count: null,
      error: null,
      anonVisibleRows: anon.error ? 0 : anon.count ?? 0,
      forbiddenRowsExist,
      metadataProtected: metadata?.protected,
      metadataEvidence: metadata?.evidence,
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
            : result.metadataProtected === true
              ? `차단 확인(대상 0건, ${result.metadataEvidence})`
              : result.metadataProtected === false
                ? `보호 실패(${result.metadataEvidence})`
                : "검증 불가(대상 0건)"
      console.log(`  ${result.anonVisibleRows > 0 || result.metadataProtected === false ? "x" : "✓"} ${result.name} (${result.label}): ${verdict}`)
      continue
    }
    const rows = result.count === null
      ? result.metadataEvidence
        ? `카탈로그 확인(${result.metadataEvidence})`
        : "호출 가능"
      : `rows=${result.count}`
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
