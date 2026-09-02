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
  // Compass(마케팅팀 앱) crm 스키마 연결 + NEO 소진 예보 + 지역 배정 + 쇼룸 예약(2026-08-28~29).
  // 파일명 사전순(= 적용 순서).
  "supabase/migrations/20260828_admin_neo_owner_link.sql",
  "supabase/migrations/20260828_compass_bridge_views.sql",
  "supabase/migrations/20260828_crm_neo_billing_mode.sql",
  "supabase/migrations/20260828_crm_neo_consumption_forecast.sql",
  "supabase/migrations/20260828_crm_region_assignments.sql",
  "supabase/migrations/20260829_showroom_bookings.sql",
  // 리드 중복 탐지 + 어드민 핫패스 인덱스(2026-09-02). 인덱스 전용 마이그레이션이라
  // 프로브의 한계는 SCHEMA_PROBES 쪽 주석 참고.
  "supabase/migrations/20260902_leads_dedupe_and_admin_hot_path_indexes.sql",
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
  // ── 어드민 담당자 ↔ NEO 연결(2026-08-28) ──────────────────────────────
  // 이 마이그레이션은 UPDATE 10건뿐인 데이터 백필이다 — neo_owner_id 컬럼 자체는
  // 20260626_admin_profiles_crm_assignments.sql에서 이미 생겼다. 그래서 REST 컬럼 프로브는
  // "이 마이그레이션이 실제로 적용돼 10명의 값이 채워졌는지"는 구분하지 못하고 컬럼이
  // 살아있는지만 본다(REST에는 특정 user_id 10건의 값을 확인할 WHERE 프로브 kind가 없다).
  // severity를 warning으로 둔 이유도 이것 — 이 프로브의 "ok"가 백필 완료를 보장하지 않는다.
  {
    kind: "table",
    table: "admin_profiles",
    label: "어드민 프로필 ↔ NEO 담당자 id 연결(데이터 백필, 컬럼 자체는 사전 존재)",
    columns: ["user_id", "neo_owner_id"],
    migration: "supabase/migrations/20260828_admin_neo_owner_link.sql",
    severity: "warning",
    impact:
      "10명 담당자의 neo_owner_id 백필이 안 됐다면(이 프로브로는 확인 불가) 재연결 알림이 담당자 개인이 아니라 관리자 전체로만 간다.",
  },
  // ── Compass 브리지 뷰 7개(2026-08-28) ──────────────────────────────────
  // 원천은 마케팅팀 앱이 소유한 crm 스키마 — service_role만 SELECT 가능(anon/authenticated는
  // REVOKE). 뷰가 깨지면 lib/compass/bridge.ts의 isCompassBridgeDown()이 감지해 소비 화면을
  // "Compass 연결 끊김" 배지로 강등한다(fail loud 설계, 무음 오염 금지).
  {
    kind: "table",
    table: "compass_leads_v",
    label: "Compass 리드 브리지 뷰(상태·재유입·NeoCRM 표식·담당 3역할)",
    columns: ["id", "phone_key", "email_key", "stage", "owner", "team", "created_at"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact:
      "Compass 리드 오버레이(app/api/admin/compass/leads-overlay)와 전화번호 대조가 깨지고, isCompassBridgeDown() 감지로 관련 화면이 'Compass 연결 끊김' 배지로 강등된다.",
  },
  {
    kind: "table",
    table: "compass_activities_v",
    label: "Compass 활동 타임라인 브리지 뷰",
    columns: ["id", "lead_id", "kind", "body", "created_at"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact: "고객 360(lib/repositories/crm-customer-360.ts) 병합 타임라인에서 Compass 쪽 활동 기록이 빠진다.",
  },
  {
    kind: "table",
    table: "compass_ads_v",
    label: "Compass 광고 소재 단위 일별 성과 브리지 뷰",
    columns: ["day", "ad_id", "ad_name", "campaign_id", "spend_usd", "leads"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact: "app/api/admin/compass/ads 조회와 creative-suggest 크리에이티브 추천이 실패한다.",
  },
  {
    kind: "table",
    table: "compass_adsets_v",
    label: "Compass 광고세트 단위 일별 성과 브리지 뷰",
    columns: ["day", "adset_id", "campaign_id", "spend_usd", "leads"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact: "광고세트 레벨 성과 조회가 실패한다(캠페인 레벨만 가능했던 이전 상태로 되돌아간다).",
  },
  {
    kind: "table",
    table: "compass_demos_v",
    label: "Compass 데모 실측 브리지 뷰",
    columns: ["id", "lead_id", "day", "status", "owner"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact:
      "lib/crm/compass-demo-source.ts의 데모 실측 신호가 끊겨 어드민 캘린더가 다시 키워드 추측(오차 3/7) 방식으로 되돌아간다.",
  },
  {
    kind: "table",
    table: "compass_cal_events_v",
    label: "Compass 캘린더 미러 브리지 뷰('MKT 데모일정' 원본)",
    columns: ["key", "day", "time", "title", "lead_id"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact: "lib/compass/calendar.ts가 소비하는 'MKT 데모일정' 캘린더 소스가 어드민 캘린더에서 사라진다.",
  },
  {
    kind: "table",
    table: "compass_revenue_v",
    label: "Compass 매출 결제 스냅샷 브리지 뷰(rev-sheet 대조용)",
    columns: ["id", "month", "customer", "status", "amount"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact: "lib/admin-crm-revenue-sheet.ts의 매출 대조 배지가 깨진다.",
  },
  // ── NEO 고객 스냅샷 과금 유형 + 소진 예보(2026-08-28) ───────────────────
  // 둘 다 lib/crm/renewal-alert-dispatch.ts 의 같은 select 문 하나에 함께 들어 있어
  // (billing_mode, ..., depletion_in_days) 두 마이그레이션 중 하나만 빠져도 그 select 전체가
  // 42703으로 실패한다 — impact가 사실상 같은 이유다.
  {
    kind: "table",
    table: "crm_neo_customer_snapshots",
    label: "NEO 고객 스냅샷 과금 유형(충전제/구독제/하드웨어) 컬럼",
    columns: ["account_id", "billing_mode"],
    migration: "supabase/migrations/20260828_crm_neo_billing_mode.sql",
    impact:
      "renewal-alert-dispatch의 select가 billing_mode를 명시 요청하므로, 컬럼이 없으면 갱신 알림 스냅샷 조회 전체가 42703으로 실패해 충전 잔액 소진 알림이 나가지 않는다.",
  },
  {
    kind: "table",
    table: "crm_neo_customer_snapshots",
    label: "NEO 고객 소진 예상일 파생 컬럼(daily_burn/depletion_in_days 등)",
    columns: ["account_id", "daily_burn", "depletion_in_days", "burn_event_count", "burn_confidence"],
    migration: "supabase/migrations/20260828_crm_neo_consumption_forecast.sql",
    impact:
      "같은 select에 depletion_in_days가 함께 있어 컬럼이 없으면 위 billing_mode와 동일하게 갱신 알림 스냅샷 조회 자체가 실패한다(재충전 임박 신호도 계산 불가).",
  },
  // ── CRM 지역 배정(2026-08-28) ──────────────────────────────────────────
  {
    kind: "table",
    table: "crm_region_assignments",
    label: "CRM 지역 배정(시도별 담당자 1명) 표",
    columns: ["id", "region_label", "owner_key", "effective_from", "effective_to"],
    migration: "supabase/migrations/20260828_crm_region_assignments.sql",
    impact:
      "lib/crm/lead-assignment-policy.ts가 '권위 있는 owner 연결 없음'을 이유로 자동 배정 후보를 구조적으로 0으로 막아둔 상태가 풀리지 않아, 신규 리드 자동 배정이 계속 전량 미배정으로 쌓인다.",
  },
  // ── 목동 쇼룸 상담 예약 접수(2026-08-29) ────────────────────────────────
  {
    kind: "table",
    table: "showroom_bookings",
    label: "목동 쇼룸 상담 예약 접수 저장소",
    columns: ["id", "visit_date", "visit_time", "org", "name", "phone", "status", "lead_id"],
    migration: "supabase/migrations/20260829_showroom_bookings.sql",
    impact: "공개 쇼룸 예약 접수(app/api/showroom)가 저장할 곳이 없어 실패하고, 리드 큐 미러링(lead_id)도 되지 않는다.",
  },
  // ── 리드 중복 탐지 + 어드민 핫패스 인덱스(2026-09-02) ───────────────────
  // 인덱스 자체의 존재는 PostgREST/REST 경로로 확인할 수 없다(pg_indexes에 REST로 접근할
  // 방법이 없고, 이 저장소의 기존 마이그레이션 중 순수 인덱스 추가 건은 애초에 SCHEMA_PROBES
  // 대상이 아니었다 — 20260827_admin_perf_indexes.sql도 프로브가 없다). 아래 3개는 그
  // 대체재로, 인덱스가 걸린 컬럼 자체가 살아있는지만 본다 — "ok"가 인덱스 생성까지
  // 보장하지는 않으므로 severity를 warning으로 둔다. 실제 지연 확인은
  // scripts/measure-admin-api.mjs로 별도 측정한다.
  {
    kind: "table",
    table: "leads",
    label: "리드 중복 탐지 대상 컬럼(phone/email) — 인덱스 존재는 이 프로브로 확인 불가",
    columns: ["id", "phone", "email"],
    migration: "supabase/migrations/20260902_leads_dedupe_and_admin_hot_path_indexes.sql",
    severity: "warning",
    impact:
      "idx_leads_phone/idx_leads_email이 없어도 기능은 정상이나, 리드 제출마다 중복 탐지 쿼리가 leads 전체 스캔으로 느려진다.",
  },
  {
    kind: "table",
    table: "admin_calendar_events",
    label: "캘린더 멀티데이 일정 범위 조회 컬럼(end_date) — 인덱스 존재는 이 프로브로 확인 불가",
    columns: ["id", "date", "end_date"],
    migration: "supabase/migrations/20260902_leads_dedupe_and_admin_hot_path_indexes.sql",
    severity: "warning",
    impact:
      "idx_admin_calendar_events_end_date가 없어도 기능은 정상이나, 멀티데이 일정이 걸치는 기간 조회(app/api/admin/calendar)가 end_date 전체 스캔으로 느려진다.",
  },
  {
    kind: "table",
    table: "crm_tasks",
    label: "매니저 리포트 완료 건수 집계 컬럼(status/completed_at) — 인덱스 존재는 이 프로브로 확인 불가",
    columns: ["id", "status", "completed_at"],
    migration: "supabase/migrations/20260902_leads_dedupe_and_admin_hot_path_indexes.sql",
    severity: "warning",
    impact:
      "idx_crm_tasks_status_completed_at이 없어도 기능은 정상이나, /api/admin/crm/manager-report의 기간 내 완료 집계가 done 누적 전체 스캔이 되고 그 비용은 시간이 지날수록 커진다.",
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
