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
  // 결제 없는 도입 신청 접수(2026-07-27). 본체 + 설치 주소 + 설치 유형 순으로 적용된다.
  "supabase/migrations/20260727_checkout_requests.sql",
  "supabase/migrations/20260727_checkout_requests_address.sql",
  "supabase/migrations/20260727_checkout_requests_install_type.sql",
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
  // 아침 리드 카드 한 장 통합(2026-09-07). 같은 날의 20260907_lead_digest_runs_daily_type.sql 은
  // lead_digest_runs.report_type CHECK 에 'daily' 를 더하는 변경뿐이라 REST 로 확인할 방법이 없어
  // 계약에 넣지 않는다(미적용이면 아침 카드 실행 선점 insert 가 23514 로 실패해 카드가 안 나간다).
  // 적용 확인은 아래 제약 조회로 한다 — 정의에 'daily' 가 보이면 적용된 것이다.
  //   select pg_get_constraintdef(oid) from pg_constraint
  //   where conname = 'lead_digest_runs_report_type_check';
  // 웹훅별 켜기/끄기 + 알림 발송 스케줄(2026-09-07) — site_settings 두 JSONB 컬럼.
  "supabase/migrations/20260907_site_settings_webhook_toggles_and_schedule.sql",
  // CRM 개요 스냅샷 stale-first(2026-09-10) — 2인자 함수를 DROP 하고 3인자로 재생성한다.
  // 스냅샷을 쓰고 advisory lock 을 잡는 SECURITY DEFINER 함수라 카탈로그로만 확인한다.
  "supabase/migrations/20260910_admin_crm_overview_stale_first.sql",
  // 광고 채널 확장 — Google Ads·네이버 검색광고(2026-09-14). 파일명 사전순(= 적용 순서).
  // ad_channel_daily 가 먼저여야 한다: 나머지 둘은 그 테이블을 참조하지 않지만, 크론이
  // 먼저 돌아 스냅샷이 쌓여 있어야 화면이 빈 채널을 "미측정"이 아니라 "집행 없음"으로 읽는다.
  // (같은 날짜의 아래 Compass·하드웨어·phone_key 와는 서로 독립이라 묶음째 앞에 둔다.)
  "supabase/migrations/20260914_ad_channel_daily.sql",
  "supabase/migrations/20260914_campaign_links_ad_channels.sql",
  "supabase/migrations/20260914_leads_naver_attribution.sql",
  // Compass 연동 브리지 2차(2026-09-14) — 전화 키 함수 + 링크/연락 뷰 + 역브리지 뷰.
  "supabase/migrations/20260914_compass_integration_bridge.sql",
  // 하드웨어 배송 예정 확정 v3(2026-09-14, 운영 적용 완료). 쓰기 RPC라 카탈로그로만 확인한다.
  // 같은 줄기의 20260915_hardware_sample_showroom_status.sql 은 check 제약 값만 넓히는 변경이라
  // REST·카탈로그 RPC 프로브로 확인할 방법이 없어 계약에 넣지 않는다 — 적용 확인은
  // docs/active/hardware-scm-tab-reference.md §6 의 제약 조회로 한다.
  "supabase/migrations/20260914_hardware_confirm_planned_v3.sql",
  // 재유입 병합 전화 정규화 키(2026-09-14) — Compass phone_key 규칙을 public.leads 생성 컬럼으로 이식.
  // 생성식이 norm_phone_key() 를 부르므로 위 compass_integration_bridge 뒤에 적용한다(파일명 순서와 같다).
  "supabase/migrations/20260914_leads_phone_key.sql",
  // 도입 신청 리드 자격 필드(2026-09-21). 같은 날의
  // 20260921_lead_source_intake_split.sql 은 leads.source 값을 옮기는 데이터 백필이라
  // 스키마 프로브로 확인할 대상이 없어 계약에 넣지 않는다 — 적용 확인은 아래 쿼리로 한다.
  //   select source, count(*) from public.leads
  //   where source_detail = 'showroom_booking' or source_detail like 'checkout_request:%'
  //   group by source;
  "supabase/migrations/20260921_checkout_requests_lead_qualifiers.sql",
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
  // ── 광고 채널 확장(2026-09-14) ────────────────────────────────────────
  // Meta 와 같은 계열의 일자 스냅샷 두 벌. 미적용이면 크론이 upsert 에서 죽고, 화면은
  // 해당 채널을 "미측정"으로 떨어뜨린다(0 으로 포장하지 않으므로 조용한 오답은 없다).
  {
    kind: "table",
    table: "google_ads_daily",
    label: "Google Ads 캠페인 일자별 성과 스냅샷",
    // synced_at 은 감사용이라 제외 — meta_insights_daily 프로브와 같은 규약.
    columns: ["date", "campaign_id", "campaign_name", "spend", "impressions", "clicks", "conversions", "currency"],
    migration: "supabase/migrations/20260914_ad_channel_daily.sql",
    impact:
      "크론(/api/cron/sync-google-ads)의 upsert 가 실패해 Google 집행이 쌓이지 않는다 — /admin/campaigns 채널 스트립의 Google 칸이 계속 '미측정'으로 남는다.",
  },
  {
    kind: "table",
    table: "naver_ads_daily",
    label: "네이버 검색광고 캠페인 일자별 성과 스냅샷",
    columns: ["date", "campaign_id", "campaign_name", "spend", "impressions", "clicks", "conversions", "currency"],
    migration: "supabase/migrations/20260914_ad_channel_daily.sql",
    impact:
      "크론(/api/cron/sync-naver-ads)의 upsert 가 실패해 네이버 집행이 쌓이지 않는다 — /admin/campaigns 채널 스트립의 네이버 칸이 계속 '미측정'으로 남는다.",
  },
  {
    kind: "table",
    table: "campaign_links",
    label: "우산 캠페인 ↔ 광고 채널 링크(ref_type CHECK 확장) — CHECK 자체는 이 프로브로 확인 불가",
    // CHECK 제약의 허용 집합은 REST 로 확인할 방법이 없다(pg_constraint 접근 불가).
    // 컬럼이 살아있는지만 보고, 실제 확장 여부는 google_campaign 링크를 한 건 저장해 보면 안다.
    // 그래서 severity 는 warning — 이 프로브의 "ok" 가 CHECK 확장을 보장하지 않는다.
    columns: ["id", "campaign_id", "ref_type", "ref_id"],
    migration: "supabase/migrations/20260914_campaign_links_ad_channels.sql",
    severity: "warning",
    impact:
      "미적용이면 Google·네이버 캠페인 링크 저장이 23514(check violation)로 거부된다. 링크 피커에서 두 채널만 실패하고 나머지는 정상이라 눈에 잘 안 띈다.",
  },
  {
    kind: "table",
    table: "leads",
    label: "네이버 검색광고 유입 파라미터 컬럼(naver_ad)",
    columns: ["id", "naver_ad"],
    migration: "supabase/migrations/20260914_leads_naver_attribution.sql",
    // 리드 저장은 이 컬럼을 선택 컬럼으로 다뤄(OPTIONAL_LEAD_INSERT_COLUMNS) 미적용에도 죽지 않는다.
    // 다만 네이버 유입 표식이 통째로 유실되므로 소급 복구가 불가능하다 — warning 이 아니라 blocker.
    impact:
      "네이버 광고를 타고 들어온 리드의 n_* 파라미터가 저장되지 않는다. 리드 저장 자체는 성공하지만(선택 컬럼) 그 기간 유입은 사후에 네이버로 귀속시킬 방법이 없다.",
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
    columns: ["id", "phone_key", "email_key", "stage", "owner", "team", "created_at", "updated_at", "last_inflow_at"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact:
      "Compass 리드 오버레이(app/api/admin/compass/leads-overlay)와 전화번호 대조가 깨지고, isCompassBridgeDown() 감지로 관련 화면이 'Compass 연결 끊김' 배지로 강등된다. 리드 상태 MKT 반영(app/api/cron/lead-contact-sync)도 실행마다 bridge_down 으로 건너뛴다.",
  },
  {
    kind: "table",
    table: "compass_activities_v",
    label: "Compass 활동 타임라인 브리지 뷰",
    columns: ["id", "lead_id", "kind", "body", "created_at"],
    migration: "supabase/migrations/20260828_compass_bridge_views.sql",
    impact:
      "고객 360(lib/repositories/crm-customer-360.ts) 병합 타임라인에서 Compass 쪽 활동 기록이 빠지고, 리드 상태 MKT 반영(app/api/cron/lead-contact-sync)이 실행마다 bridge_down 으로 건너뛴다.",
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
  // ── 웹훅별 켜기/끄기 + 알림 발송 스케줄(2026-09-07) ─────────────────────
  // updateSettings()(lib/repositories/settings.ts)가 두 컬럼을 upsert 에 무조건 싣는다.
  // 읽기(select *)는 컬럼이 없어도 죽지 않고 기본값으로 강등되므로, 드러나는 증상은 저장 실패뿐이다.
  // 같은 파일의 백필 UPDATE(wecom_ops 스위치 이관·'disabled' 문자열 정리·스케줄 기본값)는
  // 컬럼 프로브로 구분되지 않는다 — 한 파일이라 컬럼이 있으면 백필도 돌았다고 본다.
  {
    kind: "table",
    table: "site_settings",
    label: "웹훅별 켜기/끄기 맵 + 알림 발송 스케줄 컬럼",
    columns: ["id", "webhook_enabled_json", "notification_schedule_json"],
    migration: "supabase/migrations/20260907_site_settings_webhook_toggles_and_schedule.sql",
    impact:
      "사이트 설정 저장(PATCH /api/admin/settings)이 어느 탭에서든 컬럼 없음 오류로 실패한다. 읽기는 기본값으로 강등돼 조용히 틀린다 — 웹훅 스위치는 옛 wecom_ops 하나만 반영되고 아침 카드 발송 시각은 기본값(평일 11시)에 고정된다.",
  },
  // ── CRM 개요 스냅샷 stale-first(2026-09-10) ────────────────────────────
  // 스냅샷을 쓰고 dirty 로그를 지우며 advisory lock 을 잡는 SECURITY DEFINER 함수라 실행 프로브를
  // 금지하고 pg_proc·권한만 본다. 미적용이어도 앱이 2인자로 한 번 재시도해 화면은 살지만
  // blocker 로 둔다 — 이 프로브는 service_role 전용 권한도 함께 보고, anon/authenticated 에 열리면
  // CRM 사업 개요 payload 가 공개 키로 읽히고 무거운 재계산을 누구나 유발할 수 있다.
  // 한계: 3인자 시그니처만 본다. 20260613_admin_crm_overview_snapshot.sql 을 재실행하면 옛 2인자
  // 함수가 오버로드로 되살아나(두 이름만 넘기는 호출이 PGRST203) 이 프로브로는 잡히지 않는다.
  //   select oid::regprocedure from pg_proc where proname = 'admin_crm_business_overview';
  // 가 3인자 한 줄만 돌려주는지로 확인한다.
  {
    kind: "rpc",
    functionName: "admin_crm_business_overview",
    label: "CRM 개요 스냅샷 stale-first 조회(3인자, 안전핀 p_hard_max_age_seconds) RPC",
    catalogIdentityTypes: "integer, boolean, integer",
    serviceRoleOnly: true,
    migration: "supabase/migrations/20260910_admin_crm_overview_stale_first.sql",
    impact:
      "앱이 2인자 함수로 재시도해 CRM 개요는 뜨지만, 어드민 쓰기가 있었거나 300초가 지난 뒤의 조회마다 무거운 집계 재계산(실측 콜 평균 약 1초)을 동기로 기다리는 옛 동작으로 돌아가고 호출마다 실패 왕복이 한 번 더 붙는다.",
  },
  // ── Compass 연동 브리지 2차(2026-09-14) ─────────────────────────────────
  // 전부 warning — 아직 소비 코드가 어드민에 없고, Compass(lib/homeBridge.ts)는 뷰가 없으면
  // available:false 로 조용히 비켜 간다. compass_lead_* 두 뷰는 Compass 배포(crm.lead_refs·
  // crm.lead_contact_facts_v 생성) 뒤 이 마이그레이션을 재실행해야 생긴다(to_regclass 가드).
  // norm_phone_key() 는 역브리지 뷰가 호출하므로 뷰 프로브가 함수 존재까지 함께 증명한다.
  {
    kind: "table",
    table: "compass_lead_refs_v",
    label: "Compass 시스템 간 링크 브리지 뷰(crm.lead_refs)",
    columns: ["lead_id", "system", "external_id", "matched_by", "created_at"],
    migration: "supabase/migrations/20260914_compass_integration_bridge.sql",
    severity: "warning",
    impact:
      "홈페이지 리드·leadgen·채널톡 대화가 어느 Compass 리드에 붙었는지 id 로 알 수 없어 전화 키 폴백 매칭만 남는다. Compass 배포 뒤 재실행이 필요하다.",
  },
  {
    kind: "table",
    table: "compass_lead_contact_v",
    label: "Compass 리드별 연락 사실 브리지 뷰(crm.lead_contact_facts_v)",
    columns: ["lead_id", "latest_inflow_at", "first_attempt_at", "first_connected_at", "missed_since_inflow", "sms_since_inflow"],
    migration: "supabase/migrations/20260914_compass_integration_bridge.sql",
    severity: "warning",
    impact:
      "어드민이 Compass 와 같은 '연락함' 정의를 읽을 수 없어 활동 body 를 따로 해석해야 한다. Compass 배포 뒤 재실행이 필요하다.",
  },
  {
    kind: "table",
    table: "home_owner_directory_v",
    label: "담당자 디렉터리 역브리지 뷰(admin_profiles → Compass)",
    columns: ["display_name", "crm_owner_key", "crm_owner_aliases", "neo_owner_id", "crm_sort_order"],
    migration: "supabase/migrations/20260914_compass_integration_bridge.sql",
    severity: "warning",
    impact: "Compass 가 담당자 ↔ NEO owner 매핑을 어드민 원본에서 읽지 못하고 자체 상수를 계속 쓴다.",
  },
  {
    kind: "table",
    table: "home_neo_accounts_v",
    label: "NEO 고객 요약 역브리지 뷰(crm_neo_customer_snapshots → Compass)",
    columns: ["source_system", "account_id", "owner_name", "phone_key", "expire_at", "risk_level"],
    migration: "supabase/migrations/20260914_compass_integration_bridge.sql",
    severity: "warning",
    impact: "Compass 네오CRM 푸시 전 '이미 NEO 고객' 검사와 리드 상세 NEO 패널이 비활성으로 남는다.",
  },
  {
    kind: "table",
    table: "home_site_leads_v",
    label: "홈페이지 문의 집계 역브리지 뷰(leads → Compass, PII 제외)",
    columns: ["phone_key", "n", "last_at", "last_inflow_at", "last_source", "last_status"],
    migration: "supabase/migrations/20260914_compass_integration_bridge.sql",
    severity: "warning",
    impact: "Compass 리드 상세에 '홈페이지 문의 N건'이 표시되지 않는다.",
  },
  {
    kind: "table",
    table: "home_channel_contacts_v",
    label: "채널톡 상담 집계 역브리지 뷰(channel_conversations → Compass, 본문 제외)",
    columns: ["phone_key", "conversations", "messages", "last_message_at", "matched_home_lead"],
    migration: "supabase/migrations/20260914_compass_integration_bridge.sql",
    severity: "warning",
    impact: "Compass 리드 상세에 '채널톡 N건'이 표시되지 않는다.",
  },
  // ── 하드웨어 배송 예정 확정 v3(2026-09-14) ─────────────────────────────
  // 예정 행을 FOR UPDATE 로 잠그고 출고를 기록하는 쓰기 함수라 실행 프로브를 금지하고 pg_proc·권한만 본다.
  {
    kind: "rpc",
    functionName: "confirm_hardware_planned_movement_v3",
    label: "하드웨어 배송 예정 확정 v3(앱 계산 로트 배정·로트 미지정 허용) RPC",
    catalogIdentityTypes: "uuid, text, date, integer, jsonb",
    serviceRoleOnly: true,
    migration: "supabase/migrations/20260914_hardware_confirm_planned_v3.sql",
    impact:
      "앱이 v2로 폴백하는데, v2는 lot_no 칸에서만 로트를 찾아 lot_no가 빈 예정 출고(운영 원장 전부)를 확정하지 못한다.",
  },
  // ── 결제 없는 도입 신청 접수(2026-07-27) ────────────────────────────────
  // 쇼룸 예약(위)은 테이블 프로브가 있었는데 같은 성격의 checkout_requests 는 계약에
  // 아예 없었다 — 어드민 접수 큐가 두 접수를 같은 화면에서 다루게 되면서 둘의 적용
  // 여부가 한 화면의 가용성을 결정하므로 같은 수준으로 맞춘다.
  {
    kind: "table",
    table: "checkout_requests",
    label: "결제 없는 도입 신청 접수 저장소",
    columns: ["id", "kind", "items", "total_amount", "org", "name", "phone", "status", "lead_id"],
    migration: "supabase/migrations/20260727_checkout_requests.sql",
    impact:
      "결제창의 주문 신청이 저장되지 않아 500 으로 끊긴다(lib/checkout-requests.ts 는 저장 실패만 500 으로 올린다).",
  },
  {
    kind: "table",
    table: "checkout_requests",
    label: "도입 신청 설치·배송 주소 컬럼",
    columns: ["address"],
    migration: "supabase/migrations/20260727_checkout_requests_address.sql",
    impact: "하드웨어 신청이 주소를 필수로 보내는데 컬럼이 없어 insert 가 42703 으로 실패한다.",
  },
  {
    kind: "table",
    table: "checkout_requests",
    label: "도입 신청 설치 유형 컬럼(스탠드/벽걸이)",
    columns: ["install_type"],
    migration: "supabase/migrations/20260727_checkout_requests_install_type.sql",
    impact: "설치 방식이 기록되지 않아 담당자가 현장 준비물을 알 수 없다.",
  },
  {
    kind: "anon",
    table: "checkout_requests",
    label: "도입 신청 접수 anon 차단(RLS deny-all)",
    migration: "supabase/migrations/20260727_checkout_requests.sql",
    impact: "신청자 연락처·설치 주소·주문 금액이 anon 키로 읽힌다.",
  },
  {
    kind: "table",
    table: "checkout_requests",
    label: "도입 신청 리드 자격 필드(직책·학원 규모)",
    columns: ["role", "academy_size"],
    migration: "supabase/migrations/20260921_checkout_requests_lead_qualifiers.sql",
    impact:
      "신청 저장이 42703 으로 실패한다. 컬럼이 없으면 리드 스코어의 규모 배점도 계속 비어 가장 비싼 신청이 단순 문의보다 낮게 깔린다.",
  },
  {
    kind: "anon",
    table: "showroom_bookings",
    label: "쇼룸 예약 접수 anon 차단(RLS deny-all)",
    migration: "supabase/migrations/20260829_showroom_bookings.sql",
    impact: "방문자 이름·연락처·방문 일정이 anon 키로 읽힌다.",
  },
  // ── 재유입 병합 전화 정규화 키(2026-09-14) ──────────────────────────────
  // phone_key가 없어도 findLeadsByContacts()가 원문/숫자만 비교 폴백으로 계속 동작하므로
  // (기능은 안 죽는다) severity는 warning — 다만 그 폴백은 서식이 다른 같은 번호를 놓친다.
  {
    kind: "table",
    table: "leads",
    label: "재유입 병합 전화 정규화 키(phone_key, 생성 컬럼) + 마지막 유입 시각",
    columns: ["id", "phone_key", "last_inflow_at"],
    migration: "supabase/migrations/20260914_leads_phone_key.sql",
    severity: "warning",
    impact:
      "없으면 재유입 병합이 원문/숫자만 비교 폴백으로 동작해 서식이 다른 같은 번호를 못 잡는다.",
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
