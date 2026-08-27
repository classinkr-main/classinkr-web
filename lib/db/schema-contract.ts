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
  /**
   * 일반 RPC는 존재하지 않는 id로 호출해 0행 UPDATE만 나게 한다.
   * 잠금/쓰기 함수는 args 대신 catalogIdentityTypes를 써서 호출 없이 검증한다.
   */
  args?: Record<string, unknown>
  /** pg_proc.oidvectortypes 결과. 설정 시 Management API 카탈로그만 읽는다. */
  catalogIdentityTypes?: string
  /** service_role만 EXECUTE할 수 있어야 하는 내부 쓰기 RPC. */
  serviceRoleOnly?: boolean
  migration: string
  severity?: SchemaProbeSeverity
  impact?: string
}

/**
 * anon 키로 실제 노출 여부를 확인하는 RLS 프로브.
 * `pg_class.relrowsecurity` 같은 메타데이터가 아니라 "정말 읽히는가"를 본다 —
 * RLS가 켜져 있어도 정책이 과하게 열려 있으면 메타데이터는 통과하기 때문이다.
 *
 * 판정에 service role 카운트를 함께 쓴다. 대상 행이 애초에 0건이면 anon이 0건을 보는 것은
 * 아무것도 증명하지 못하므로(위양성) "검증 불가"로 분류한다.
 */
export interface SchemaAnonProbe {
  kind: "anon"
  table: string
  label: string
  /** 이 조건에 해당하는 행은 anon에게 절대 보이면 안 된다. 생략하면 전 행이 대상. */
  forbidden?: { operator: "eq" | "neq"; column: string; value: string }
  migration: string
  severity?: SchemaProbeSeverity
  impact?: string
}

export type SchemaProbe = SchemaTableProbe | SchemaRpcProbe | SchemaAnonProbe

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
  /** anon 프로브 전용 — anon 키로 실제로 보인 금지 대상 행 수. */
  anonVisibleRows?: number
  /** anon 프로브 전용 — service role 기준 금지 대상 행 수(0이면 검증 불가). */
  forbiddenRowsExist?: number
  /**
   * 금지 대상 행이 0건인 deny-all 테이블의 보조 증거.
   * Management API로 RLS 활성화 + anon/public SELECT 정책 부재를 직접 확인했을 때만 true다.
   */
  metadataProtected?: boolean
  /** 운영자가 어떤 메타데이터로 판정했는지 확인할 수 있는 짧은 설명. */
  metadataEvidence?: string
  /** anon 프로브 전용 — anon 키가 없어 건너뛴 경우. */
  skipped?: boolean
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
  "supabase/migrations/20260818_rls_blog_posts_patch_notes.sql",
  // 마케팅 퍼포먼스 대시보드 스파인(2026-08-20) — 5개 신규 테이블. 파일명 사전순(= 적용 순서).
  "supabase/migrations/20260820_channel_budgets.sql",
  "supabase/migrations/20260820_event_metrics.sql",
  "supabase/migrations/20260820_marketing_campaign_updates.sql",
  "supabase/migrations/20260820_marketing_insights.sql",
  "supabase/migrations/20260820_meta_insights_daily.sql",
  // 스냅샷·선택 행 조건·감사 로그를 한 트랜잭션에서 보장하는 리드 배정 RPC.
  "supabase/migrations/20260827_guarded_lead_assignment.sql",
  // 기존 20260818 마이그레이션이 적용됐는데 RPC만 빠진 live DB를 전방향으로 복구한다.
  "supabase/migrations/20260827_repair_increment_campaign_click_count.sql",
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
    functionName: "assign_leads_guarded",
    label: "리드 배정 스냅샷·동시성 가드 RPC",
    // 함수 자체가 테이블 잠금을 잡으므로 실행 프로브를 금지하고 pg_proc/권한만 확인한다.
    catalogIdentityTypes: "uuid[], text, jsonb, text, text, text, text",
    serviceRoleOnly: true,
    migration: "supabase/migrations/20260827_guarded_lead_assignment.sql",
    impact: "검토 완료 리드를 담당자에게 원자적으로 배정할 수 없고, 배정 화면이 안전하게 실패한다.",
  },
  {
    kind: "rpc",
    functionName: "increment_campaign_click_count",
    label: "클릭 추적 원자 증가 RPC",
    // 존재하지 않는 UUID — WHERE 가 0행이라 부작용이 없다.
    args: { campaign_id: "00000000-0000-4000-8000-000000000000" },
    migration: "supabase/migrations/20260827_repair_increment_campaign_click_count.sql",
    impact: "/api/track/click 이 카운트를 못 올린다(리다이렉트는 계속 동작).",
  },
  // RLS 공백 마감 — 감사에서 149개 테이블 중 이 둘만 RLS가 꺼져 있었다.
  {
    kind: "anon",
    table: "blog_posts",
    label: "비공개 글(DRAFT·검토·보관) anon 노출 차단",
    forbidden: { operator: "neq", column: "status", value: "PUBLISHED" },
    migration: "supabase/migrations/20260818_rls_blog_posts_patch_notes.sql",
    impact: "발행 전 초안·휴지통 글이 anon 키로 읽히고 쓰기까지 열려 있다.",
  },
  {
    kind: "anon",
    table: "patch_notes",
    label: "패치노트 anon 접근 차단(deny-all)",
    migration: "supabase/migrations/20260818_rls_blog_posts_patch_notes.sql",
    impact: "내부 패치노트가 anon 키로 읽히고 쓰기까지 열려 있다.",
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
  // 마케팅 퍼포먼스 대시보드 스파인(2026-08-20) — 5개 신규 테이블, 파일명 사전순(= 적용 순서).
  {
    kind: "table",
    table: "channel_budgets",
    label: "채널별 배정 예산(KRW)",
    columns: ["channel", "amount"],
    migration: "supabase/migrations/20260820_channel_budgets.sql",
    impact:
      "채널 예산 배정 조회·저장(GET/PATCH /api/admin/channel-budgets)이 실패해 대시보드 예산 소진율을 계산할 수 없다.",
  },
  {
    kind: "table",
    table: "event_metrics",
    label: "행사 캠페인 수기 성과",
    columns: ["event_id", "metrics"],
    migration: "supabase/migrations/20260820_event_metrics.sql",
    impact: "행사 상세의 수기 입력(목표·퍼널·광고비·매출)이 저장되지 않고, 목록·프로젝트 롤업 조회가 실패한다.",
  },
  {
    kind: "table",
    table: "marketing_campaign_updates",
    label: "우산 캠페인 진행상황 업데이트 로그",
    columns: ["id", "campaign_id", "kind", "body", "created_by"],
    migration: "supabase/migrations/20260820_marketing_campaign_updates.sql",
    impact: "캠페인 진행상황 로그 조회·기록이 실패한다(스코어보드 최근 업데이트·통합 피드 표시 불가).",
  },
  {
    kind: "table",
    table: "marketing_insights",
    label: "마케팅 AI 주간 브리핑 저장",
    columns: ["id", "scope", "digest", "headline", "payload", "model"],
    migration: "supabase/migrations/20260820_marketing_insights.sql",
    impact: "아직 소비 코드가 없다(AI 주간 브리핑 기능의 선행 스키마) — 이후 구현 시 이 프로브가 먼저 걸린다.",
  },
  {
    kind: "table",
    table: "meta_insights_daily",
    label: "Meta 캠페인 일자별 성과 스냅샷",
    // synced_at(동기화 시각) 은 감사용 컬럼이라 제외 — 나머지는 spend/leads 등 실제 지표 컬럼.
    columns: ["date", "campaign_id", "campaign_name", "spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "leads", "currency"],
    migration: "supabase/migrations/20260820_meta_insights_daily.sql",
    impact:
      "크론(/api/cron/sync-meta-insights)과 백필 스크립트(scripts/backfill-meta-insights.mjs)의 upsert 가 실패해 일자별 스냅샷이 쌓이지 않는다(조회 함수는 아직 라우트에 연결되지 않았다).",
  },
]

export function probeName(probe: SchemaProbe): string {
  if (probe.kind === "rpc") return `${probe.functionName}()`
  if (probe.kind === "anon") return `${probe.table} (anon)`
  return probe.table
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
    if (result.skipped) {
      warning.push({
        name: result.name,
        label: result.label,
        message: "anon 키가 없어 건너뜀",
        migration: result.migration,
        remedy: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 설정하면 실제 노출 여부까지 검증합니다.",
      })
      continue
    }

    if (result.anonVisibleRows !== undefined) {
      if (result.anonVisibleRows > 0) {
        blocked.push({
          name: result.name,
          label: result.label,
          message: `anon 키로 금지 대상 ${result.anonVisibleRows}건이 읽힙니다`,
          migration: result.migration,
          remedy: remedyFor(result, "missing"),
          impact: result.impact,
        })
        continue
      }
      // 금지 대상 행이 0건이면 anon이 0건을 보는 것만으로는 아무것도 증명하지 않는다.
      // 다만 deny-all 프로브는 Management API로 RLS + 공개 SELECT 정책 부재를 직접 확인할 수 있다.
      if (!result.forbiddenRowsExist) {
        if (result.metadataProtected === true) {
          ok.push(result)
          continue
        }
        if (result.metadataProtected === false) {
          blocked.push({
            name: result.name,
            label: result.label,
            message: `RLS 메타데이터 보호 실패${result.metadataEvidence ? ` — ${result.metadataEvidence}` : ""}`,
            migration: result.migration,
            remedy: remedyFor(result, "missing"),
            impact: result.impact,
          })
          continue
        }
        warning.push({
          name: result.name,
          label: result.label,
          message: "검증 불가 — 금지 대상 행이 0건이라 차단 여부를 확인할 수 없습니다",
          migration: result.migration,
          remedy: "대상 데이터가 생긴 뒤 다시 실행하거나 RLS 상태를 직접 확인하세요.",
        })
        continue
      }
      ok.push(result)
      continue
    }

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
