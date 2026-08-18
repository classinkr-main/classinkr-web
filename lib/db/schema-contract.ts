/**
 * DB 스키마 계약 — "프로덕션 DB가 repo 마이그레이션까지 최신인가"를 판정하는 SSOT.
 *
 * 이 저장소는 마이그레이션을 수동 적용하고(Supabase SQL Editor/CLI), 확인은 그때마다
 * 임시 스크립트(tmp/db-probe-*.mjs)로 해 왔다. 그 방식은 기록이 남지 않아 "적용했는지"를
 * 나중에 아무도 확신하지 못한다 — 실제로 `email_campaigns`가 repo에 CREATE TABLE 없이
 * 프로덕션에만 존재하는 고아 테이블로 오래 남았다(20260703_email_campaigns_backfill.sql).
 *
 * 그래서 프로브를 코드로 고정한다. 새 마이그레이션을 추가하면 여기에 프로브도 함께 추가한다.
 * 챗봇/문서 알파 계약은 lib/chatbot/alpha-db-contract.ts가 따로 담당한다(중복 등재하지 않는다).
 *
 * 순수 모듈 — Supabase 클라이언트를 import하지 않는다(단위 테스트 대상).
 * 실행: npm run check:db
 */

export type SchemaProbeSeverity = "blocker" | "warning"

export interface SchemaTableProbe {
  kind: "table"
  table: string
  label: string
  /** 존재를 확인할 컬럼 — 누락 시 42703으로 구분된다(테이블 부재 42P01과 다름). */
  columns: string[]
  migration: string
  /** 이 행 수 미만이면 warning — 스키마는 맞는데 데이터 이관이 안 끝난 상태를 잡는다. */
  minimumRows?: number
  /** 데이터 이관 명령(minimumRows 미달 시 안내). */
  seedCommand?: string
  severity?: SchemaProbeSeverity
  /** 미적용 시 무엇이 깨지는지 — 운영자가 우선순위를 판단할 수 있게. */
  impact?: string
}

export interface SchemaRpcProbe {
  kind: "rpc"
  functionName: string
  label: string
  /** 부작용이 없어야 한다 — 존재하지 않는 id로 호출해 0행 UPDATE만 나게 한다. */
  args: Record<string, unknown>
  migration: string
  severity?: SchemaProbeSeverity
  impact?: string
}

export type SchemaProbe = SchemaTableProbe | SchemaRpcProbe

export interface SchemaProbeResult {
  name: string
  label: string
  migration: string
  severity: SchemaProbeSeverity
  /** 테이블 프로브만 채워진다. RPC는 성공 시 null. */
  count: number | null
  error: string | null
  minimumRows?: number
  seedCommand?: string
  impact?: string
}

export interface SchemaProbeIssue {
  name: string
  label: string
  message: string
  migration: string
  remedy: string
  impact?: string
}

export interface SchemaProbeSummary {
  status: "ok" | "warning" | "blocked"
  ok: SchemaProbeResult[]
  warning: SchemaProbeIssue[]
  blocked: SchemaProbeIssue[]
}

/** 프로브가 존재를 검증하는 마이그레이션 — 적용 순서대로. */
export const SCHEMA_CONTRACT_MIGRATIONS = [
  "supabase/migrations/20260818_email_campaign_metrics.sql",
  "supabase/migrations/20260818_lead_magnets.sql",
] as const

export const SCHEMA_PROBES: SchemaProbe[] = [
  {
    kind: "table",
    table: "email_campaigns",
    label: "이메일 캠페인 성과(클릭·부분 실패)",
    // click_count/failed_count/send_errors 가 2026-08-18 신규 컬럼이다.
    columns: ["id", "subject", "open_count", "click_count", "failed_count", "send_errors"],
    migration: "supabase/migrations/20260818_email_campaign_metrics.sql",
    impact: "발송 이력의 클릭·실패 수가 기록되지 않는다(발송 자체는 동작 — best-effort 기록).",
  },
  {
    kind: "rpc",
    functionName: "increment_campaign_click_count",
    label: "클릭 추적 원자 증가 RPC",
    // 존재하지 않는 UUID — WHERE 가 0행이라 부작용이 없다.
    args: { campaign_id: "00000000-0000-4000-8000-000000000000" },
    migration: "supabase/migrations/20260818_email_campaign_metrics.sql",
    impact: "/api/track/click 이 카운트를 못 올린다(리다이렉트는 계속 동작).",
  },
  {
    kind: "table",
    table: "lead_magnets",
    label: "자료 퍼널 저장소",
    columns: ["slug", "data", "published"],
    migration: "supabase/migrations/20260818_lead_magnets.sql",
    minimumRows: 1,
    seedCommand: "node --env-file=.env.local scripts/import-lead-magnets.mjs",
    impact:
      "어드민에서 자료 생성·수정이 차단된다. 공개 표면(/resources·자료 다운로드)은 번들 JSON으로 강등돼 계속 뜨지만, 그 상태에서 저장한 편집은 반영되지 않는다.",
  },
]

export function probeName(probe: SchemaProbe): string {
  return probe.kind === "table" ? probe.table : `${probe.functionName}()`
}

/** PostgREST가 컬럼 부재로 돌려주는 신호 — 테이블 부재(42P01/PGRST205)와 구분한다. */
export function isMissingColumnMessage(message: string): boolean {
  return /42703|column .* does not exist|could not find the '.*' column/i.test(message)
}

export function isMissingTableMessage(message: string): boolean {
  return /42P01|PGRST205|could not find the table|relation .* does not exist/i.test(message)
}

function remedyFor(result: SchemaProbeResult, cause: "missing" | "empty"): string {
  if (cause === "empty") {
    return result.seedCommand
      ? `데이터 이관 실행: ${result.seedCommand}`
      : `${result.name} 초기 데이터를 넣으세요.`
  }
  return `${result.migration} 를 프로덕션 DB에 적용하세요.`
}

/**
 * 프로브 결과를 ok / warning / blocked 로 분류한다.
 * - 스키마 부재(테이블·컬럼·RPC) = blocked. 마이그레이션을 적용해야 한다.
 * - 스키마는 맞는데 행이 minimumRows 미만 = warning. 이관 스크립트만 남았다.
 */
export function summarizeSchemaProbes(results: SchemaProbeResult[]): SchemaProbeSummary {
  const ok: SchemaProbeResult[] = []
  const warning: SchemaProbeIssue[] = []
  const blocked: SchemaProbeIssue[] = []

  for (const result of results) {
    if (result.error) {
      const issue: SchemaProbeIssue = {
        name: result.name,
        label: result.label,
        message: result.error,
        migration: result.migration,
        remedy: remedyFor(result, "missing"),
        impact: result.impact,
      }
      if (result.severity === "warning") warning.push(issue)
      else blocked.push(issue)
      continue
    }

    if (
      result.minimumRows !== undefined &&
      result.count !== null &&
      result.count < result.minimumRows
    ) {
      warning.push({
        name: result.name,
        label: result.label,
        message: `행 ${result.count}건 — 최소 ${result.minimumRows}건 필요`,
        migration: result.migration,
        remedy: remedyFor(result, "empty"),
        impact: result.impact,
      })
      continue
    }

    ok.push(result)
  }

  return {
    status: blocked.length > 0 ? "blocked" : warning.length > 0 ? "warning" : "ok",
    ok,
    warning,
    blocked,
  }
}
