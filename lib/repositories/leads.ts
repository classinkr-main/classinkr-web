/**
 * Leads Repository — JSON ↔ Supabase 듀얼 모드
 *
 * 환경변수 USE_SUPABASE_LEADS=true 로 Supabase 전환
 * 기존 lib/db.ts 의 함수 시그니처를 최대한 유지
 */

import "server-only";

import { revalidateTag } from "next/cache";
import { ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG } from "@/lib/admin/crm/cache-tags";
import { normalizePhoneKey } from "@/lib/compass/normalize";
import { summarizeLeadResponseStatus } from "@/lib/crm/lead-response-status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Lead, LeadInsert, LeadUpdate } from "@/lib/supabase/database.types";
import { parseNaverAd, type NaverAdAttribution } from "@/lib/naver-ad-params";

// 기존 타입 re-export (호환성)
export type { LeadStatus } from "@/lib/supabase/database.types";

export function shouldUseSupabaseLeads(
  env: Record<string, string | undefined> = process.env
) {
  // Vercel's runtime filesystem is read-only, so JSON fallback cannot safely
  // accept public lead writes there even if USE_SUPABASE_LEADS is missing.
  const isVercelRuntime =
    env.VERCEL === "1" ||
    Boolean(env.VERCEL_ENV) ||
    Boolean(env.VERCEL_URL) ||
    Boolean(env.NEXT_PUBLIC_VERCEL_URL);

  return env.USE_SUPABASE_LEADS === "true" || isVercelRuntime;
}

const USE_SUPABASE = shouldUseSupabaseLeads();
export const ADMIN_LEADS_OVERVIEW_CACHE_TAG = "admin-leads-overview";
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
/**
 * leads에 last_inflow_at(재유입 축, 20260828 마이그레이션)이 추가됐지만
 * database.types.ts는 다른 작업과 충돌을 피하려 재생성하지 않았다. 생성 타입에 없는
 * 컬럼 하나만 구조적으로 얹어 쓴다 — any 캐스팅 없이 타입이 계속 성립한다.
 */
type LeadInsertWithInflow = LeadInsert & { last_inflow_at?: string | null };
type LeadRowWithInflow = Lead & { last_inflow_at?: string | null };

const OPTIONAL_LEAD_INSERT_COLUMNS = [
  "branch",
  "notes",
  "source_detail",
  "lead_magnet",
  "follow_up_at",
  "assigned_to",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "landing_page",
  "current_page",
  "referrer",
  "confirmed_at",
  "anonymous_id",
  // 20260914 마이그레이션. 미적용 환경에서도 리드 저장이 통째로 죽지 않게 선택 컬럼으로 다룬다.
  "naver_ad",
  // 마이그레이션 미적용 환경에서도 리드 저장이 통째로 죽지 않게 선택 컬럼으로 다룬다.
  "last_inflow_at",
] as const satisfies readonly (keyof LeadInsertWithInflow)[];

interface SupabaseColumnError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * 리드 사본을 들고 캐시하는 소비자(CRM 홈 우선순위 큐 등)가 구독한다.
 * 리스너는 자기 모듈 캐시를 비우기만 한다 — I/O·await 금지(여기서 던지면 쓰기가 깨진다).
 * 구독 방향이 반대면(소비자를 여기서 import) 소비자가 이미 이 모듈을 읽고 있어 순환이 된다.
 */
type LeadMutationListener = () => void;
const leadMutationListeners = new Set<LeadMutationListener>();

export function onLeadsMutated(listener: LeadMutationListener) {
  leadMutationListeners.add(listener);
}

function invalidateLeadReadCaches() {
  // Overview는 요청자 쿠키와 무관한 서비스 롤 집계라 서버 공용 캐시를 쓴다.
  // 리드 쓰기 직후에는 다음 읽기가 반드시 새 값을 보도록 즉시 만료한다.
  revalidateTag(ADMIN_LEADS_OVERVIEW_CACHE_TAG, { expire: 0 });
  // 리드는 crm-unified-customers.ts 소스 스냅샷(unstable_cache)의 입력이기도 하다. 그
  // 스냅샷은 이 리포지토리를 import해 쓰므로(순환 방지) 여기서 직접 구독을 걸 수 없어
  // (onLeadsMutated 같은 리스너 대신) 태그를 바로 SWR 무효화한다 — 쓰기 직후 클라이언트가
  // 자체 mutationScopeAt으로 재조회하므로 "max"(하드 만료 아님)가 맞는 톤이다
  // (docs/active/admin-performance-plan-2026-09-02.md §4.4).
  revalidateTag(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, "max");
  leadRowsMemo.clear();
  for (const listener of leadMutationListeners) listener();
}

function returnAfterLeadMutation<T>(value: T): T {
  invalidateLeadReadCaches();
  return value;
}

/* ─── 기존 LeadRecord ↔ Supabase Lead 변환 ─── */

// 기존 코드와 호환되는 LeadRecord 타입
export interface LeadRecord {
  id: string;
  source: string;
  name?: string;
  org?: string;
  role?: string;
  size?: string;
  email?: string;
  phone?: string;
  message?: string;
  timestamp: string;
  /** 배정 미리보기 이후 동시 변경을 감지하는 서버 버전. JSON 폴백에서는 없을 수 있다. */
  updated_at?: string;
  status: "new" | "contacted" | "converted" | "closed";
  branch?: string;
  notes?: string;
  source_detail?: string;
  lead_magnet?: string;
  follow_up_at?: string;
  assigned_to?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  ttclid?: string;
  landing_page?: string;
  current_page?: string;
  referrer?: string;
  // 공개 채널 리드는 검토 전 null(미확인) — "확인" 액션 또는 상태 변경(new 이탈)으로 채워짐.
  // admin_manual(어드민 수기 등록)은 생성 시점에 즉시 채워진다.
  confirmed_at?: string;
  // 제출 시점의 익명 식별자(cln_aid) — 사이트 활동 귀속의 결합 키.
  anonymous_id?: string;
  // 네이버 검색광고 유입 파라미터(n_*). undefined = 미조회이거나 네이버 유입이 아님.
  // 키 목록·정규화는 lib/naver-ad-params.ts 가 정본.
  naver_ad?: NaverAdAttribution;
  // 마지막 유입 시각(재유입 축, 20260828 마이그레이션). 신규 저장 시 생성 시각과 같고, 응대 대상 소스의
  // 재문의는 새 행 대신 이 값만 갱신된다(lib/server/lead-capture.ts 재유입 병합). 기간 유입 집계는
  // lib/crm/lead-reinflow.ts leadInflowInWindow 로 생성 시각과 함께 본다.
  last_inflow_at?: string;
}

export interface LeadActionStats {
  total: number;
  byStatus: Record<LeadRecord["status"], number>;
  unrespondedCount: number;
  unresponded24hCount: number;
  unresponded48hCount: number;
  todayFollowUpCount: number;
  overdueFollowUpCount: number;
  // 미확인(confirmed_at null) — 공개 채널에서 들어와 아직 검토되지 않은 리드.
  unconfirmedCount: number;
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function isActiveLeadStatus(status: LeadRecord["status"]) {
  return status !== "converted" && status !== "closed";
}

function assertDurableLeadStorage() {
  if (!USE_SUPABASE && IS_PRODUCTION_RUNTIME) {
    throw new Error("[leads] production lead capture requires USE_SUPABASE_LEADS=true");
  }
}

function isMissingOptionalLeadColumn(error: SupabaseColumnError) {
  const haystack = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) return false;

  return OPTIONAL_LEAD_INSERT_COLUMNS.some((column) =>
    haystack.includes(column.toLowerCase())
  );
}

function isMissingLeadColumn(error: SupabaseColumnError, column: keyof LeadInsertWithInflow) {
  const haystack = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return Boolean(haystack) && haystack.includes(String(column).toLowerCase());
}

/**
 * 스키마에 없는 컬럼만 골라 덜어낸다.
 *
 * 예전에는 어떤 컬럼 하나가 없으면 선택 컬럼 전부를 버렸다. 그래서 마이그레이션이
 * 아직 안 걸린 배포 창에서 리드 1건이 utm_source·gclid·landing_page 까지 통째로
 * 잃었다 — 없는 컬럼 하나 때문에 멀쩡한 귀속 데이터를 버리는 셈이다.
 * 오류 메시지가 컬럼을 지목하면 그것만 덜고, 못 짚으면 예전처럼 전부 덜어낸다.
 */
function stripOptionalLeadColumns(insert: LeadInsertWithInflow, error?: SupabaseColumnError) {
  const fallbackInsert: Partial<LeadInsertWithInflow> = { ...insert };

  const named = error
    ? OPTIONAL_LEAD_INSERT_COLUMNS.filter((column) => isMissingLeadColumn(error, column))
    : [];
  const doomed = named.length > 0 ? named : OPTIONAL_LEAD_INSERT_COLUMNS;

  for (const column of doomed) {
    delete fallbackInsert[column];
  }

  return fallbackInsert;
}

function supabaseToLegacy(row: LeadRowWithInflow): LeadRecord {
  return {
    id: row.id,
    source: row.source,
    name: row.name ?? undefined,
    org: row.org ?? undefined,
    role: row.role ?? undefined,
    size: row.size ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    message: row.message ?? undefined,
    timestamp: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
    branch: row.branch ?? undefined,
    notes: row.notes ?? undefined,
    source_detail: row.source_detail ?? undefined,
    lead_magnet: row.lead_magnet ?? undefined,
    follow_up_at: row.follow_up_at ?? undefined,
    assigned_to: row.assigned_to ?? undefined,
    utm_source: row.utm_source ?? undefined,
    utm_medium: row.utm_medium ?? undefined,
    utm_campaign: row.utm_campaign ?? undefined,
    utm_term: row.utm_term ?? undefined,
    utm_content: row.utm_content ?? undefined,
    gclid: row.gclid ?? undefined,
    fbclid: row.fbclid ?? undefined,
    msclkid: row.msclkid ?? undefined,
    ttclid: row.ttclid ?? undefined,
    landing_page: row.landing_page ?? undefined,
    current_page: row.current_page ?? undefined,
    referrer: row.referrer ?? undefined,
    confirmed_at: row.confirmed_at ?? undefined,
    anonymous_id: row.anonymous_id ?? undefined,
    // JSONB 라 무엇이든 들어올 수 있다 — 목록 밖 키는 parseNaverAd 가 버린다.
    naver_ad: parseNaverAd(row.naver_ad) ?? undefined,
    // 전량(`*`)·마케팅 스코프만 이 컬럼을 select한다 — 대시보드·캠페인·보드 스코프에서는 undefined다.
    last_inflow_at: row.last_inflow_at ?? undefined,
  };
}

/* ─── READ ─── */

/**
 * PostgREST는 서버의 max-rows 설정을 넘는 행을 조용히 잘라 반환한다. 전량이 필요한 화면
 * (리드 보드·우선순위 큐·캠페인 귀속)에서 이 절단은 에러가 아니라 "그런 리드는 없다"로
 * 보이므로, 페이지를 끝까지 넘겨 전량을 모은다.
 *
 * created_at 하나만으로는 전순서가 아니다 — 동일 시각 리드가 페이지 경계에 걸리면 중복·누락이
 * 생기므로 id를 타이브레이커로 함께 정렬한다. 페이지 전진은 요청한 크기가 아니라 실제로 받은
 * 행 수만큼 한다(서버 상한이 요청 크기보다 작아도 건너뛰지 않는다).
 */
const LEAD_PAGE_SIZE = 1000;
/** 폭주 방지용 상한. 실제 리드 규모를 훨씬 넘는 값이다. */
const LEAD_MAX_ROWS = 100_000;

/** 컬럼 누락 폴백(대시보드 조회)이 원본 오류 모양을 그대로 볼 수 있게 감싸 전달한다. */
class LeadQueryError extends Error {
  readonly supabaseError: SupabaseColumnError;

  constructor(message: string, supabaseError: SupabaseColumnError) {
    super(message);
    this.name = "LeadQueryError";
    this.supabaseError = supabaseError;
  }
}

/**
 * 감사 2026-09-07 §7 — 등록 API가 조회 후 삽입(findLeadsByContacts → Promise.allSettled(saveLead))
 * 하는 사이 동시 요청이 끼어들면 같은 연락처가 두 번 저장될 수 있다. DB 유니크 제약
 * (supabase/migrations/20260910_leads_contact_unique_dedupe.sql)이 나중에 막아 주면,
 * 이 클래스로 "그 제약에 걸려 막힌 것"과 "진짜 저장 실패"를 구분해 호출부가 duplicates로
 * 셀 수 있게 한다. 마이그레이션이 아직 없는 환경에서는 이 경로 자체가 발생하지 않는다.
 * ⚠️ 그 마이그레이션은 적용 보류다(2026-09-15) — 공개 리드 재제출까지 23505로 막아 Meta 웹훅 리드가
 * DB에서 빠진다. docs/active/db-migration-runbook.md "적용 보류 중인 마이그레이션" 참고.
 */
export class LeadDuplicateError extends Error {
  constructor(message = "이미 등록된 리드입니다(전화/이메일 일치).") {
    super(message);
    this.name = "LeadDuplicateError";
  }
}

/** Postgres 유니크 제약 위반(23505)인지 — leads 연락처 유니크 인덱스가 걸렸을 때만 해당한다. */
function isUniqueViolation(error: SupabaseColumnError): boolean {
  return error.code === "23505";
}

/**
 * 감사 2026-09-07 §8 — leads/[id], crm/deals-lite/[id], crm/tasks/[id]에는 동시 편집을 검증할
 * version/updated_at 비교가 전혀 없어 "마지막 쓰기가 이긴다"(먼저 저장한 사람의 변경이 조용히
 * 사라짐). bulk-assign만 snapshotToken+expectedVersions로 재검증한다(CRM 유일의 낙관적 잠금).
 * 이 에러는 leads/[id] PATCH가 그 최소 버전을 갖추도록 updateLead()의 낙관적 잠금 실패를 나타낸다.
 */
export class LeadVersionConflictError extends Error {
  constructor(message = "다른 곳에서 먼저 이 리드를 수정했습니다. 새로고침 후 다시 시도해 주세요.") {
    super(message);
    this.name = "LeadVersionConflictError";
  }
}

const LEAD_ROWS_MEMO_TTL_MS = 30_000;

/**
 * 전량 조회 메모 — 같은 컬럼셋을 짧은 창 안에 다시 읽으면 테이블을 다시 훑지 않는다.
 *
 * next/cache 대신 프로세스 메모인 이유: 리드 전량 페이로드는 ISR 캐시 아이템 한도(2MB)를
 * 넘길 수 있고, 넘기면 캐싱이 조용히 무산된다. 키가 컬럼 문자열이라 스코프와 컬럼 폴백
 * 경로가 자연히 분리된다. 값에 진행 중 promise를 담아 동시 요청이 한 왕복을 나눠 쓰고,
 * 실패한 엔트리는 지워 오류를 캐시하지 않는다. 만료 기준 시각은 응답이 아니라 요청 시작이다.
 */
const leadRowsMemo = new Map<string, { startedAt: number; rows: Promise<Lead[]> }>();

async function fetchAllLeadRows(columns: string, label: string): Promise<Lead[]> {
  const cached = leadRowsMemo.get(columns);
  if (cached && Date.now() - cached.startedAt < LEAD_ROWS_MEMO_TTL_MS) {
    // 호출부가 정렬 등 제자리 변형을 해도 캐시가 오염되지 않게 배열은 매번 새로 준다.
    return [...(await cached.rows)];
  }

  const entry = { startedAt: Date.now(), rows: loadAllLeadRows(columns, label) };
  leadRowsMemo.set(columns, entry);
  entry.rows.catch(() => {
    if (leadRowsMemo.get(columns) === entry) leadRowsMemo.delete(columns);
  });

  return [...(await entry.rows)];
}

async function loadAllLeadRows(columns: string, label: string): Promise<Lead[]> {
  const supabase = createSupabaseAdminClient();

  // 첫 페이지에서 count: "exact" 로 총 행수를 함께 받는다.
  const {
    data: firstData,
    error: firstError,
    count,
  } = await supabase
    .from("leads")
    .select(columns, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, LEAD_PAGE_SIZE - 1);

  if (firstError) throw new LeadQueryError(`[leads] ${label} 실패: ${firstError.message}`, firstError);

  const rows = [...((firstData ?? []) as unknown as Lead[])];
  const total = typeof count === "number" ? Math.min(count, LEAD_MAX_ROWS) : null;

  // 순차 폴백 — 페이지 전진은 실제 받은 행 수만큼(서버 상한이 요청 크기보다 작아도 건너뛰지 않는다).
  const fetchSequentially = async () => {
    while (rows.length < LEAD_MAX_ROWS) {
      if (total != null && rows.length >= total) break;
      const { data, error } = await supabase
        .from("leads")
        .select(columns)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(rows.length, rows.length + LEAD_PAGE_SIZE - 1);
      if (error) throw new LeadQueryError(`[leads] ${label} 실패: ${error.message}`, error);
      const batch = (data ?? []) as unknown as Lead[];
      if (batch.length === 0) break;
      rows.push(...batch);
    }
    return rows;
  };

  if (total == null) return fetchSequentially();
  if (rows.length >= total || rows.length === 0) return rows;

  // 총 행수를 알았으니 남은 range 를 병렬로 받는다 — 5천 행을 직렬 5왕복으로 기다리지 않는다.
  // 스텝은 요청 크기(LEAD_PAGE_SIZE)가 아니라 "첫 페이지가 실제로 돌려준 행 수"다 — PostgREST
  // max-rows 가 요청보다 작게 클램프하면 요청 크기 간격의 range 는 중간 행을 조용히 건너뛴다.
  // 각 range 쿼리는 같은 정렬(created_at desc, id desc)의 서로 다른 구간이라 이어붙이면 순서가 보존된다.
  const step = rows.length;
  const ranges: Array<{ from: number; to: number }> = [];
  for (let from = step; from < total; from += step) {
    ranges.push({ from, to: Math.min(from + step, total) - 1 });
  }
  const pages = await Promise.all(
    ranges.map(async ({ from, to }) => {
      const { data, error } = await supabase
        .from("leads")
        .select(columns)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw new LeadQueryError(`[leads] ${label} 실패: ${error.message}`, error);
      return (data ?? []) as unknown as Lead[];
    })
  );
  for (const page of pages) rows.push(...page);

  // 방어 — 어떤 range 가 기대보다 적게 돌려줬다면(이론상 드묾) 순차로 마저 채워 절단을 막는다.
  if (rows.length < total) return fetchSequentially();
  return rows;
}

export async function getLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  const rows = await fetchAllLeadRows("*", "조회");
  return rows.map(supabaseToLegacy);
}

/**
 * 대시보드 전용 경량 조회 — message/notes/utm_* 등 무거운 컬럼을 제외하고
 * 화면에서 실제로 쓰는 필드만 가져온다. (overview 페이로드 축소용)
 * supabaseToLegacy는 미선택 컬럼을 `?? undefined`로 처리하므로 그대로 재사용 가능.
 */
export async function getDashboardLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  try {
    const rows = await fetchAllLeadRows(
      "id, source, name, org, email, status, branch, created_at, confirmed_at",
      "대시보드 조회"
    );
    return rows.map(supabaseToLegacy);
  } catch (error) {
    if (!(error instanceof LeadQueryError) || !isMissingLeadColumn(error.supabaseError, "confirmed_at")) {
      throw error;
    }
    const fallback = await fetchAllLeadRows(
      "id, source, name, org, email, status, branch, created_at",
      "대시보드 조회"
    );
    return fallback.map(supabaseToLegacy);
  }
}

/**
 * 캠페인 화면 전용 경량 조회 — 행사↔리드 귀속에 필요한 최소 컬럼만 가져온다.
 * 귀속 해시는 `${lead.source} ${lead.notes}`(event:<id|slug> 토큰 탐지), 기간 창 매칭은
 * created_at(timestamp)을 쓴다. dashboard 스코프에는 notes가 없어 재사용할 수 없다
 * (감사 2026-07-23 §후속 2). status는 LeadRecord 필수 필드 정합용으로 포함한다.
 * supabaseToLegacy는 미선택 컬럼을 `?? undefined`로 처리하므로 그대로 재사용 가능.
 */
export async function getCampaignLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  const rows = await fetchAllLeadRows("id, source, status, notes, created_at", "캠페인 조회");
  return rows.map(supabaseToLegacy);
}

/**
 * 캠페인 허브 "광고 리드" 섹션 전용 조회 — 마케팅 렌즈·트래킹 롤업·전환·CSV가 함께 쓰는 컬럼.
 *
 * campaigns 스코프(귀속 5컬럼)로는 부족하다: 렌즈 판정(lib/crm/lead-attribution)이 utm_*·클릭ID·
 * lead_magnet·landing_page를 보고, 목록은 이름·학원·연락처를, 전환 버튼은 status를 본다.
 * message를 포함하는 이유는 구버전 Meta 리드애즈 웹훅이 광고·세트명을 message 텍스트에만
 * 남겼기 때문 — 빼면 그 시절 리드가 캠페인·광고 축 롤업에서 통째로 "미기록"으로 떨어진다.
 *
 * 전체(`*`)를 쓰지 않는 이유는 size·referrer·anonymous_id 처럼 이 화면이 쓰지 않는 컬럼과,
 * 앞으로 늘어날 컬럼까지 캠페인 페이로드에 자동으로 실리는 것을 막기 위함이다.
 * supabaseToLegacy는 미선택 컬럼을 `?? undefined`로 처리하므로 그대로 재사용 가능.
 */
const MARKETING_LEAD_COLUMN_LIST = [
  "id", "source", "name", "org", "role", "email", "phone", "message", "status",
  "branch", "notes", "source_detail", "lead_magnet", "follow_up_at", "assigned_to",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "msclkid", "ttclid", "landing_page", "current_page",
  "naver_ad",
  "created_at", "confirmed_at",
  // 재유입 축(20260828) — 재문의 병합(lib/server/lead-capture.ts)은 새 행 대신 이 컬럼만 갱신한다.
  // "오늘 유입"(lib/marketing/intake-feed.ts)이 재문의를 재유입으로 세는 근거라 이 스코프에 싣는다.
  "last_inflow_at",
] as const;

// 마이그레이션 전 배포 창에서도 화면이 깨지지 않게 — 아직 없는 컬럼만 빼고 다시 읽는다(대시보드
// 조회와 같은 폴백). naver_ad(20260914)는 저장 쪽에만 선택 컬럼 폴백이 있고 이 SELECT 에는 없어서,
// 마이그레이션보다 코드가 먼저 나가면 마케팅 허브의 리드 집계가 42703 으로 통째로 실패했다 —
// 런북의 "읽기 경로는 강등한다" 규칙대로 맞춘다. 빠진 컬럼은 supabaseToLegacy 가 undefined 로 둔다.
// last_inflow_at 이 빠지면 재문의가 재유입으로 잡히지 않을 뿐(생성 시각 축으로 강등), 집계는 산다.
const MARKETING_LEAD_OPTIONAL_COLUMNS = ["naver_ad", "confirmed_at", "last_inflow_at"] as const;

export async function getMarketingLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  let columns: string[] = [...MARKETING_LEAD_COLUMN_LIST];
  // 선택 컬럼 수만큼만 다시 시도한다 — 그 밖의 오류(또는 같은 컬럼이 또 걸리는 경우)는 그대로 던진다.
  for (let attempt = 0; attempt <= MARKETING_LEAD_OPTIONAL_COLUMNS.length; attempt += 1) {
    try {
      const rows = await fetchAllLeadRows(columns.join(", "), "마케팅 조회");
      return rows.map(supabaseToLegacy);
    } catch (error) {
      if (!(error instanceof LeadQueryError)) throw error;
      const supabaseError = error.supabaseError;
      const missing = MARKETING_LEAD_OPTIONAL_COLUMNS.find(
        (column) => columns.includes(column) && isMissingLeadColumn(supabaseError, column)
      );
      if (!missing) throw error;
      console.warn(`[leads] 마케팅 조회: ${missing} 컬럼이 없어 빼고 다시 읽습니다(마이그레이션 미적용).`);
      columns = columns.filter((column) => column !== missing);
    }
  }
  // 도달하지 않는다 — 마지막 시도의 실패는 위 catch 가 그대로 던진다(타입 검사용 종결).
  throw new Error("[leads] 마케팅 조회 실패: 선택 컬럼 폴백을 모두 소진했습니다.");
}

/**
 * 리드 보드(감사 2026-09-07 §5, 279.6KB/전 컬럼) 전용 조회 — `*` 대신 이 화면이 실제로 쓰는
 * 컬럼만 가져와 페이로드를 줄인다. anonymous_id·last_inflow_at은 components/admin/crm/leads/**
 * 전수 grep(2026-09-10)으로 렌더링·검색·정렬 어디에도 안 쓰이는 걸 확인한 내부 트래킹 컬럼이라
 * 뺀다 — 두 컬럼 다 별도 API(activity-summary·재유입 판정)가 자기 쿼리로 직접 읽으므로 이 응답에
 * 실려 갈 필요가 없다.
 *
 * 행(row)은 줄이지 않는다 — 이 화면은 "전량이 필요한 화면"으로 이미 문서화돼 있고
 * (아래 fetchAllLeadRows 주석, tests/repositories/leads-pagination.test.ts), 기본 기간 창을
 * 넣으면 칸반의 전환·종료 열이 실제보다 적게 보이는 눈에 띄는 회귀가 된다 — dev 서버로 화면을
 * 확인할 수 없는 상태에서 되돌릴 근거 없이 감행하지 않는다.
 * updated_at은 뺄 목록에 넣지 않는다 — leads/[id] PATCH의 낙관적 잠금(동시 편집 충돌 감지)이
 * 클라이언트가 들고 있던 이 값을 그대로 비교 기준으로 쓴다.
 * confirmed_at 폴백은 마케팅 조회와 같은 이유(마이그레이션 전 배포 창 보호)로 그대로 따른다.
 */
const BOARD_LEAD_COLUMNS = [
  "id", "source", "name", "org", "role", "size", "email", "phone", "message",
  "status", "branch", "notes", "source_detail", "lead_magnet", "follow_up_at",
  "assigned_to", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "msclkid", "ttclid", "landing_page", "current_page", "referrer",
  "created_at", "updated_at", "confirmed_at",
].join(", ");

const BOARD_LEAD_COLUMNS_WITHOUT_CONFIRMED = BOARD_LEAD_COLUMNS.replace(", confirmed_at", "");

export async function getBoardLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  try {
    const rows = await fetchAllLeadRows(BOARD_LEAD_COLUMNS, "보드 조회");
    return rows.map(supabaseToLegacy);
  } catch (error) {
    if (!(error instanceof LeadQueryError) || !isMissingLeadColumn(error.supabaseError, "confirmed_at")) {
      throw error;
    }
    const fallback = await fetchAllLeadRows(BOARD_LEAD_COLUMNS_WITHOUT_CONFIRMED, "보드 조회");
    return fallback.map(supabaseToLegacy);
  }
}

/**
 * MKT(Compass) 처리 결과 반영 대상 — 전화가 있는 신규·연락함 리드의 id·전화·상태만.
 * 판정은 lib/compass/lead-contact-sync, 실행은 lib/server/lead-contact-compass-sync.
 * JSON 폴백 모드(로컬 픽스처)는 반영하지 않으므로 대상도 없다.
 */
export async function getLeadsForCompassContactSync(): Promise<
  Array<{ id: string; phone: string; status: LeadRecord["status"] }>
> {
  if (!USE_SUPABASE) return [];

  const rows = await fetchAllLeadRows("id, phone, status", "MKT 연락 반영 대상 조회");
  const targets: Array<{ id: string; phone: string; status: LeadRecord["status"] }> = [];
  // offset 페이지 사이에 새 리드가 끼면 경계 행이 두 번 올 수 있다 — 판정 건수가 부풀지 않게 접는다.
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.status !== "new" && row.status !== "contacted") continue;
    if (!row.phone?.trim()) continue;
    targets.push({ id: row.id, phone: row.phone, status: row.status });
  }
  return targets;
}

export async function getLeadById(id: string): Promise<LeadRecord | null> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads().find((l) => l.id === id) ?? null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return supabaseToLegacy(data as Lead);
}

/**
 * 등록 전 중복 검사 + 재유입 병합 후보 조회용 — 전화/이메일이 일치할 수 있는 기존 리드의
 * 최소 컬럼만 가져온다.
 *
 * 전화 키는 normalizePhoneKey(Compass phone_key와 같은 규칙, lib/compass/normalize.ts)로
 * 만든다 — 하이픈("010-1234-5678")뿐 아니라 국가코드 서식(+82/0082)까지 흡수해야
 * "010-1234-5678"과 "+82 10-1234-5678"을 같은 번호로 묶을 수 있기 때문이다(digitsOnly만으로는
 * 국가코드가 붙은 자리수가 달라 다른 번호로 오인한다). phone_key 생성 컬럼(20260914
 * 마이그레이션)이 아직 없는 배포 창에서는 PostgREST 42703(또는 메시지의 "phone_key" 언급)을
 * 감지해 기존 원문/숫자만/정규화 키 3중 in("phone", …) 비교로 폴백한다. 이메일도 원문·소문자형을
 * 함께 조회한다.
 *
 * status/timestamp/last_inflow_at은 호출부(lib/server/lead-capture.ts submitLeadCapture)가
 * 재유입 병합 대상(new/contacted)과 그중 최신 1건을 고르는 데 쓴다 — 병합 여부의 최종 판정은
 * 여기서 하지 않는다.
 */
export async function findLeadsByContacts(contacts: {
  phones: string[];
  emails: string[];
}): Promise<
  Pick<LeadRecord, "id" | "phone" | "email" | "source" | "status" | "timestamp" | "last_inflow_at" | "notes">[]
> {
  const phones = contacts.phones.map((phone) => phone.trim()).filter(Boolean);
  const emails = contacts.emails.map((email) => email.trim()).filter(Boolean);
  if (phones.length === 0 && emails.length === 0) return [];

  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const phoneKeyOf = (value: string) => normalizePhoneKey(value) ?? "";

  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    const phoneKeys = new Set(phones.map(phoneKeyOf).filter(Boolean));
    const emailKeys = new Set(emails.map((email) => email.toLowerCase()));
    return jsonGetLeads()
      .filter(
        (lead) =>
          (lead.phone && phoneKeys.has(phoneKeyOf(lead.phone))) ||
          (lead.email && emailKeys.has(lead.email.toLowerCase()))
      )
      .map((lead) => ({
        id: lead.id,
        phone: lead.phone,
        email: lead.email,
        source: lead.source,
        status: lead.status,
        timestamp: lead.timestamp,
        notes: lead.notes,
        // JSON 폴백의 LeadRecord(lib/site-settings-types.ts)는 last_inflow_at을 선언하지 않는다
        // (그 축은 Supabase 전용 20260828 마이그레이션에서 추가됐다) — 구조적으로 얹어 읽는다.
        last_inflow_at: (lead as { last_inflow_at?: string }).last_inflow_at,
      }));
  }

  const supabase = createSupabaseAdminClient();
  // notes 는 행사 신청 토큰([event:slug], notes 첫 줄) 판정용 — 재유입 병합이 다른 행사의
  // 신청 집계를 덮어쓰지 않게 호출부가 본다(lib/server/lead-capture.ts).
  // source 는 재유입 병합 대상을 응대 대상 소스 행으로 좁히는 데 쓴다(lib/server/lead-capture.ts pickReinflowTarget).
  const CONTACT_COLUMNS = "id, phone, email, source, status, created_at, last_inflow_at, notes";
  type ContactRow = {
    id: string;
    phone: string | null;
    email: string | null;
    source: LeadRecord["source"];
    status: LeadRecord["status"];
    created_at: string;
    last_inflow_at: string | null;
    notes: string | null;
  };

  const phoneKeyCandidates = Array.from(new Set(phones.map(phoneKeyOf).filter(Boolean)));
  const emailCandidates = Array.from(
    new Set(emails.flatMap((email) => [email, email.toLowerCase()]))
  );

  const [phoneKeyRes, emailRes] = await Promise.all([
    phoneKeyCandidates.length > 0
      ? supabase.from("leads").select(CONTACT_COLUMNS).in("phone_key", phoneKeyCandidates)
      : Promise.resolve({ data: [], error: null }),
    emailCandidates.length > 0
      ? supabase.from("leads").select(CONTACT_COLUMNS).in("email", emailCandidates)
      : Promise.resolve({ data: [], error: null }),
  ]);

  let phoneRows = (phoneKeyRes.data ?? []) as unknown as ContactRow[];
  let phoneError = phoneKeyRes.error as SupabaseColumnError | null;

  if (phoneError && (phoneError.code === "42703" || phoneError.message?.includes("phone_key"))) {
    // phone_key 생성 컬럼(20260914 마이그레이션)이 아직 없는 배포 창 — 기존 3중 in() 비교로 폴백.
    const phoneCandidates = Array.from(
      new Set(
        phones.flatMap((phone) => [phone, digitsOnly(phone), phoneKeyOf(phone)]).filter(Boolean)
      )
    );
    const fallback =
      phoneCandidates.length > 0
        ? await supabase.from("leads").select(CONTACT_COLUMNS).in("phone", phoneCandidates)
        : { data: [], error: null };
    phoneRows = (fallback.data ?? []) as unknown as ContactRow[];
    phoneError = fallback.error as SupabaseColumnError | null;
  }

  const error = phoneError ?? (emailRes.error as SupabaseColumnError | null);
  if (error) throw new Error(`[leads] 중복 조회 실패: ${error.message}`);

  // 전화·이메일 양쪽에 걸린 리드가 두 번 세이지 않게 id로 합친다.
  const byId = new Map<
    string,
    Pick<LeadRecord, "id" | "phone" | "email" | "source" | "status" | "timestamp" | "last_inflow_at" | "notes">
  >();
  for (const row of [...phoneRows, ...((emailRes.data ?? []) as unknown as ContactRow[])]) {
    byId.set(row.id, {
      id: row.id,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      source: row.source,
      status: row.status,
      timestamp: row.created_at,
      last_inflow_at: row.last_inflow_at ?? undefined,
      notes: row.notes ?? undefined,
    });
  }
  return Array.from(byId.values());
}

/* ─── CREATE ─── */

export async function saveLead(
  lead: Omit<LeadRecord, "id" | "status">
): Promise<LeadRecord> {
  assertDurableLeadStorage();

  if (!USE_SUPABASE) {
    const { saveLead: jsonSaveLead } = await import("@/lib/db");
    return returnAfterLeadMutation(jsonSaveLead(lead));
  }

  // 공개 리드 제출은 admin 클라이언트 사용 (RLS: anyone can insert)
  const supabase = createSupabaseAdminClient();

  const insert: LeadInsertWithInflow = {
    source: lead.source,
    name: lead.name ?? null,
    org: lead.org ?? null,
    role: lead.role ?? null,
    size: lead.size ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    message: lead.message ?? null,
    branch: lead.branch ?? null,
    status: "new",
    notes: lead.notes ?? null,
    source_detail: lead.source_detail ?? null,
    lead_magnet: lead.lead_magnet ?? null,
    // 어드민 등록은 첫 팔로업·담당자를 함께 보낼 수 있다. 여기서 null로 덮으면
    // 입력 폼이 받은 값이 저장 직전에 조용히 사라진다(공개 제출은 애초에 안 보내므로 무해).
    follow_up_at: lead.follow_up_at ?? null,
    assigned_to: lead.assigned_to ?? null,
    utm_source: lead.utm_source ?? null,
    utm_medium: lead.utm_medium ?? null,
    utm_campaign: lead.utm_campaign ?? null,
    utm_term: lead.utm_term ?? null,
    utm_content: lead.utm_content ?? null,
    gclid: lead.gclid ?? null,
    fbclid: lead.fbclid ?? null,
    msclkid: lead.msclkid ?? null,
    ttclid: lead.ttclid ?? null,
    landing_page: lead.landing_page ?? null,
    current_page: lead.current_page ?? null,
    referrer: lead.referrer ?? null,
    // 호출자가 명시하지 않으면 미확인(null) — 공개 채널 리드의 기본값.
    // 어드민 수기 등록(app/api/admin/leads)만 생성 시점에 confirmed_at을 명시적으로 채운다.
    confirmed_at: lead.confirmed_at ?? null,
    anonymous_id: lead.anonymous_id ?? null,
    // 빈 객체는 저장하지 않는다 — NULL 이어야 "네이버 유입이 아님"으로 읽힌다.
    naver_ad: parseNaverAd(lead.naver_ad),
    // 재유입 축의 시작점. 마이그레이션 백필은 기존 행만 채웠으므로 여기서 안 넣으면
    // 신규 행은 전부 NULL로 남아 컬럼이 죽는다. 이 함수는 새 행을 만들 때만 불리므로 최초값 =
    // 생성 시각이 맞다 — 같은 연락처의 재문의는 lib/server/lead-capture.ts 의 재유입 병합 분기가
    // 새 행 대신 touchLeadInflow()로 이 컬럼만 갱신한다(응대 대상 소스 한정. 그 밖의 소스와
    // 어드민 수기 등록·챗봇·캡처 경로는 여전히 제출마다 한 행이다).
    last_inflow_at: lead.last_inflow_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(insert)
    .select()
    .single();

  if (error) {
    // 감사 §7 — 유니크 제약 위반은 컬럼 누락과 무관하니 재시도 없이 곧장 구분해 던진다.
    if (isUniqueViolation(error)) {
      throw new LeadDuplicateError();
    }
    if (isMissingOptionalLeadColumn(error)) {
      console.warn(
        "[leads] optional lead columns are missing; retrying without the named columns:",
        error.message
      );

      // 1차 재시도 — 오류가 지목한 컬럼만 덜어낸다. 나머지 귀속 데이터는 지킨다.
      const fallback = await supabase
        .from("leads")
        .insert(stripOptionalLeadColumns(insert, error))
        .select()
        .single();

      if (!fallback.error) {
        return returnAfterLeadMutation(supabaseToLegacy(fallback.data as Lead));
      }
      if (isUniqueViolation(fallback.error)) {
        throw new LeadDuplicateError();
      }

      // 2차 재시도 — 여러 컬럼이 한꺼번에 없으면(마이그레이션 여러 개 미적용) 오류가
      // 한 번에 하나씩만 지목한다. 이때는 예전처럼 선택 컬럼을 전부 덜어 저장을 살린다.
      // 리드를 잃는 것보다 귀속을 잃는 게 낫다.
      if (isMissingOptionalLeadColumn(fallback.error)) {
        console.warn(
          "[leads] still missing optional columns; retrying with core lead fields only:",
          fallback.error.message
        );

        const bare = await supabase
          .from("leads")
          .insert(stripOptionalLeadColumns(insert))
          .select()
          .single();

        if (bare.error) {
          if (isUniqueViolation(bare.error)) {
            throw new LeadDuplicateError();
          }
          throw new Error(`[leads] 저장 실패: ${bare.error.message}`);
        }

        return returnAfterLeadMutation(supabaseToLegacy(bare.data as Lead));
      }

      throw new Error(`[leads] 저장 실패: ${fallback.error.message}`);
    }

    throw new Error(`[leads] 저장 실패: ${error.message}`);
  }

  return returnAfterLeadMutation(supabaseToLegacy(data as Lead));
}

/* ─── UPDATE ─── */

export async function updateLead(
  id: string,
  patch: Partial<LeadRecord>,
  /**
   * 감사 §8 — 지정하면 낙관적 잠금을 건다: 저장 시점에 DB의 updated_at이 이 값과 다르면
   * (그사이 다른 곳에서 먼저 저장했다는 뜻) LeadVersionConflictError를 던지고 이 쓰기는
   * 반영하지 않는다. 생략(undefined)하면 기존 동작 그대로 무조건 덮어쓴다 — 기존 호출부
   * (assignLeads 등)는 한 줄도 안 바뀐다.
   */
  options?: { expectedUpdatedAt?: string | null }
): Promise<LeadRecord | null> {
  if (!USE_SUPABASE) {
    const { updateLead: jsonUpdateLead } = await import("@/lib/db");
    const updated = jsonUpdateLead(id, patch);
    return updated ? returnAfterLeadMutation(updated) : null;
  }

  const supabase = createSupabaseAdminClient();

  const update: LeadUpdate = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.source_detail !== undefined) update.source_detail = patch.source_detail;
  if (patch.lead_magnet !== undefined) update.lead_magnet = patch.lead_magnet;
  if (patch.branch !== undefined) update.branch = patch.branch;
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.org !== undefined) update.org = patch.org;
  if (patch.follow_up_at !== undefined) update.follow_up_at = patch.follow_up_at;
  if (patch.assigned_to !== undefined) update.assigned_to = patch.assigned_to;
  if (patch.utm_source !== undefined) update.utm_source = patch.utm_source;
  if (patch.utm_medium !== undefined) update.utm_medium = patch.utm_medium;
  if (patch.utm_campaign !== undefined) update.utm_campaign = patch.utm_campaign;
  if (patch.utm_term !== undefined) update.utm_term = patch.utm_term;
  if (patch.utm_content !== undefined) update.utm_content = patch.utm_content;
  if (patch.gclid !== undefined) update.gclid = patch.gclid;
  if (patch.fbclid !== undefined) update.fbclid = patch.fbclid;
  if (patch.msclkid !== undefined) update.msclkid = patch.msclkid;
  if (patch.ttclid !== undefined) update.ttclid = patch.ttclid;
  if (patch.landing_page !== undefined) update.landing_page = patch.landing_page;
  if (patch.current_page !== undefined) update.current_page = patch.current_page;
  if (patch.referrer !== undefined) update.referrer = patch.referrer;
  if (patch.confirmed_at !== undefined) update.confirmed_at = patch.confirmed_at;

  // null/undefined를 걸러낸 뒤의 문자열 버전에만 이후 로직이 반응한다 — options! 같은
  // 비-null 단언 없이 하나의 지역 변수로 좁혀서 쓴다.
  const expectedUpdatedAt: string | null =
    options?.expectedUpdatedAt !== undefined && options.expectedUpdatedAt !== null
      ? options.expectedUpdatedAt
      : null;
  const hasVersionGuard = expectedUpdatedAt !== null;

  // 버전 조건이 있으면 WHERE에 같이 걸어 "읽고 나서 쓰는" 사이 창을 없앤다 — 조건까지 포함한
  // 단일 UPDATE라 DB가 원자적으로 판정한다(select→compare→update 순서에는 그 자체로 레이스가 있다).
  let query = supabase.from("leads").update(update).eq("id", id);
  if (expectedUpdatedAt !== null) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select().single();

  if (error && isMissingLeadColumn(error, "confirmed_at") && update.confirmed_at !== undefined) {
    const fallbackUpdate = { ...update };
    delete fallbackUpdate.confirmed_at;

    if (Object.keys(fallbackUpdate).length === 0) {
      const existing = await getLeadById(id);
      return existing ? { ...existing, confirmed_at: patch.confirmed_at ?? undefined } : null;
    }

    let fallbackQuery = supabase.from("leads").update(fallbackUpdate).eq("id", id);
    if (expectedUpdatedAt !== null) fallbackQuery = fallbackQuery.eq("updated_at", expectedUpdatedAt);
    const fallback = await fallbackQuery.select().single();

    if (fallback.error) {
      if (hasVersionGuard && !(await getLeadById(id))) return null;
      if (hasVersionGuard) throw new LeadVersionConflictError();
      return null;
    }
    if (!fallback.data) return null;
    return returnAfterLeadMutation({
      ...supabaseToLegacy(fallback.data as Lead),
      confirmed_at: patch.confirmed_at ?? undefined,
    });
  }

  if (error) {
    // 버전 조건을 걸었을 때만 "충돌 vs 진짜 없음"을 가린다 — 조건이 없으면 0행은 항상
    // "그런 id 없음"이라 기존 계약(404) 그대로 null을 반환한다.
    if (hasVersionGuard) {
      const stillExists = await getLeadById(id);
      if (stillExists) throw new LeadVersionConflictError();
    }
    return null;
  }
  if (!data) return null;
  return returnAfterLeadMutation(supabaseToLegacy(data as Lead));
}

/**
 * 재유입 병합 전용 — last_inflow_at만 갱신한다. status/assigned_to/follow_up_at/notes 등
 * 다른 필드는 절대 건드리지 않는다 — Compass 웹훅의 재유입 분기도 last_inflow_at·연락처·지역만
 * coalesce로 채우고 담당·단계는 그대로 둔다(Compass 저장소의
 * app/api/webhook/meta/route.ts). updateLead와 같은 변경 리스너·캐시 무효화
 * (returnAfterLeadMutation)를 태운다.
 *
 * last_inflow_at 컬럼(20260828 마이그레이션)이 없는 배포 창에서는 warn만 남기고 null을
 * 돌려준다 — 호출부(submitLeadCapture)는 병합 여부를 이 반환값과 무관하게 이미 결정했으므로
 * 리드 제출 자체는 막히지 않는다.
 */
export async function touchLeadInflow(id: string, at?: string): Promise<LeadRecord | null> {
  const inflowAt = at ?? new Date().toISOString();

  // JSON 폴백은 스키마 제약이 없어 기존 updateLead 경로를 그대로 재사용한다 — updateLead 자신의
  // Supabase 분기는 LeadUpdate 타입에 last_inflow_at이 없어 이 필드를 조용히 무시하므로
  // (스키마에 없는 컬럼을 얹어 쓰는 saveLead와 달리 updateLead는 그 목록에 last_inflow_at을
  // 추가하지 않았다) Supabase 모드는 아래에서 전용 update 호출로 직접 처리한다.
  if (!USE_SUPABASE) {
    return updateLead(id, { last_inflow_at: inflowAt });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ last_inflow_at: inflowAt })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isMissingLeadColumn(error, "last_inflow_at")) {
      console.warn("[leads] last_inflow_at 컬럼이 없어 재유입 시각 갱신을 건너뜁니다:", error.message);
    } else {
      console.warn("[leads] touchLeadInflow 실패:", error.message);
    }
    return null;
  }
  if (!data) return null;

  return returnAfterLeadMutation(supabaseToLegacy(data as LeadRowWithInflow));
}

/**
 * 선택한 리드들의 담당자를 한 번의 저장소 호출로 갱신한다.
 *
 * 범용 벌크 PATCH가 아니라 담당자 필드만 열어 둔다. 상태·확인 도장·연락 증빙처럼
 * 행마다 사전조건이 다른 필드는 단건 라우트의 검증을 우회하면 안 된다.
 */
export async function assignLeads(
  ids: string[],
  assignedTo: string | null
): Promise<LeadRecord[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  if (!USE_SUPABASE) {
    const { updateLeads: jsonUpdateLeads } = await import("@/lib/db");
    const updated = jsonUpdateLeads(uniqueIds, { assigned_to: assignedTo ?? undefined });
    return updated.length > 0 ? returnAfterLeadMutation(updated) : [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ assigned_to: assignedTo })
    .in("id", uniqueIds)
    .select();

  if (error) throw new Error(`[leads] 일괄 담당자 배정 실패: ${error.message}`);
  const updated = ((data ?? []) as Lead[]).map(supabaseToLegacy);
  return updated.length > 0 ? returnAfterLeadMutation(updated) : [];
}

/** in(...) 한 번에 싣는 리드 id 수 — UUID 100개 ≈ 3.8KB, PostgREST URL 길이 상한 대비. */
const LEAD_ID_UPDATE_CHUNK = 100;

export interface CompassLeadStatusSyncResult {
  contacted: string[];
  /** from = DB가 실제로 바꾼 전이의 출발 상태(계획 시점 값이 아니다) */
  closed: Array<{ id: string; from: "new" | "contacted" }>;
  /** 이번 반영으로 confirmed_at이 새로 찍힌 id — 복구 때 null로 되돌릴 대상 */
  stamped: string[];
  confirmedAt: string;
  /** shouldContinue가 false를 돌려 남은 덩어리를 시작하지 않았다 */
  stoppedEarly: boolean;
}

/** 반영 도중 실패. partial은 실패 전까지 DB가 실제로 바꾼 행이다 — 감사 기록·복구의 근거. */
export class CompassLeadStatusSyncError extends Error {
  readonly partial: CompassLeadStatusSyncResult;

  constructor(message: string, partial: CompassLeadStatusSyncResult) {
    super(message);
    this.name = "CompassLeadStatusSyncError";
    this.partial = partial;
  }
}

/**
 * MKT(Compass) 처리 결과를 리드 상태에 반영한다 — lib/server/lead-contact-compass-sync 전용.
 *
 * 위 assignLeads 주석의 "상태·확인 도장은 단건 라우트 검증을 우회하지 않는다" 원칙의 좁은 예외다.
 *  * 사전조건을 WHERE에 건다 — 연락함은 status='new'인 행만, 종료는 status가 new·contacted인 행만.
 *    판정과 쓰기 사이에 사람이 전환·종료했으면 그 행은 조용히 빠진다(돌려주는 id에 없다).
 *  * 단건 PATCH의 "연락중은 연락 기록 저장 뒤에만" 규칙은 걸지 않는다 — 근거가 MKT 활동 기록에 있다.
 *  * 확인 도장은 PATCH가 new를 벗어날 때 찍는 규칙과 같다. 도장이 빈 행은 상태와 도장을 한 UPDATE로
 *    바꿔서, 중간에 실패해도 "상태만 바뀌고 도장이 빈" 행(보드 미확인 칸에 갇히는 행)이 생기지 않는다.
 *  * 중간 실패는 CompassLeadStatusSyncError(partial)로 던진다. shouldContinue가 false면 다음 덩어리를
 *    시작하지 않고 멈춘다(크론 예산 마감).
 * JSON 폴백 모드(로컬 픽스처)에서는 아무것도 하지 않는다.
 */
export async function applyCompassLeadStatusSync(
  input: { contactedIds: readonly string[]; closedIds: readonly string[] },
  options: { now?: Date; shouldContinue?: () => boolean } = {}
): Promise<CompassLeadStatusSyncResult> {
  const result: CompassLeadStatusSyncResult = {
    contacted: [],
    closed: [],
    stamped: [],
    confirmedAt: (options.now ?? new Date()).toISOString(),
    stoppedEarly: false,
  };
  if (!USE_SUPABASE) return result;

  const supabase = createSupabaseAdminClient();
  const shouldContinue = options.shouldContinue ?? (() => true);
  let stampSupported = true;

  const chunksOf = (ids: readonly string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const chunks: string[][] = [];
    for (let index = 0; index < unique.length; index += LEAD_ID_UPDATE_CHUNK) {
      chunks.push(unique.slice(index, index + LEAD_ID_UPDATE_CHUNK));
    }
    return chunks;
  };

  // 바뀐 행은 UPDATE마다 바로 기록한다 — 다음 UPDATE가 실패해도 partial에 빠지지 않는다.
  const record = (rows: unknown, to: "contacted" | "closed", from: "new" | "contacted", stamped: boolean) => {
    for (const { id } of (rows ?? []) as Array<{ id: string }>) {
      if (to === "contacted") result.contacted.push(id);
      else result.closed.push({ id, from });
      if (stamped) result.stamped.push(id);
    }
  };

  // 새 상태는 from 조건에 걸리지 않으므로 두 번째 UPDATE가 첫 번째에서 바뀐 행을 다시 잡지 않는다.
  const moveChunk = async (chunk: string[], to: "contacted" | "closed", from: "new" | "contacted") => {
    if (stampSupported) {
      const stampedMove = await supabase
        .from("leads")
        .update({ status: to, confirmed_at: result.confirmedAt })
        .in("id", chunk)
        .eq("status", from)
        .is("confirmed_at", null)
        .select("id");
      // 폴백은 "컬럼이 없다"는 오류 코드일 때만 — 이름만 겹치는 다른 오류(제약 위반 등)에 내려가면
      // 남은 덩어리가 도장 없이 상태만 바뀐다.
      const missingStampColumn =
        (stampedMove.error?.code === "PGRST204" || stampedMove.error?.code === "42703") &&
        isMissingLeadColumn(stampedMove.error, "confirmed_at");
      if (missingStampColumn) {
        stampSupported = false;
      } else if (stampedMove.error) {
        throw new Error(`[leads] MKT 상태 반영(${from}→${to}) 실패: ${stampedMove.error.message}`);
      } else {
        record(stampedMove.data, to, from, true);
      }
    }
    const plainMove = await supabase
      .from("leads")
      .update({ status: to })
      .in("id", chunk)
      .eq("status", from)
      .select("id");
    if (plainMove.error) throw new Error(`[leads] MKT 상태 반영(${from}→${to}) 실패: ${plainMove.error.message}`);
    record(plainMove.data, to, from, false);
  };

  const steps: Array<{ ids: readonly string[]; to: "contacted" | "closed"; from: "new" | "contacted" }> = [
    { ids: input.contactedIds, to: "contacted", from: "new" },
    { ids: input.closedIds, to: "closed", from: "new" },
    { ids: input.closedIds, to: "closed", from: "contacted" },
  ];

  try {
    steps: for (const step of steps) {
      for (const chunk of chunksOf(step.ids)) {
        if (!shouldContinue()) {
          result.stoppedEarly = true;
          break steps;
        }
        await moveChunk(chunk, step.to, step.from);
      }
    }
  } catch (error) {
    throw new CompassLeadStatusSyncError(error instanceof Error ? error.message : String(error), result);
  } finally {
    // 중간에 실패·중단해도 이미 바뀐 행이 있으면 다음 읽기가 옛 상태를 보지 않게 한다.
    if (result.contacted.length > 0 || result.closed.length > 0) invalidateLeadReadCaches();
  }
  return result;
}

interface GuardedLeadAssignmentParams {
  ids: string[];
  assignedTo: string;
  expectedVersions: Record<string, string | null>;
  actor: {
    userId: string | null;
    displayName: string | null;
    role: string | null;
  };
  reasonCode: string;
}

/**
 * 모든 리드 버전·선택 행 전제조건·감사 로그를 하나의 DB 트랜잭션에서 검증/저장한다.
 * 전체 버전 지도를 비교하므로 미리보기 뒤 선택 밖 중복 리드가 추가되는 경쟁도 차단한다.
 */
export async function assignLeadsGuarded({
  ids,
  assignedTo,
  expectedVersions,
  actor,
  reasonCode,
}: GuardedLeadAssignmentParams): Promise<LeadRecord[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  if (!USE_SUPABASE) {
    const current = await getLeads();
    const currentById = new Map(current.map((lead) => [lead.id, lead]));
    const changed = Object.entries(expectedVersions).some(
      ([id, version]) => (currentById.get(id)?.updated_at ?? null) !== version
    );
    if (changed || current.length !== Object.keys(expectedVersions).length) {
      throw new Error("[leads] assignment snapshot changed");
    }
    const { updateLeads: jsonUpdateLeads } = await import("@/lib/db");
    const updated = jsonUpdateLeads(uniqueIds, { assigned_to: assignedTo });
    if (updated.length !== uniqueIds.length) throw new Error("[leads] guarded assignment count mismatch");
    return returnAfterLeadMutation(updated);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("assign_leads_guarded", {
    p_ids: uniqueIds,
    p_assigned_to: assignedTo,
    p_expected_versions: expectedVersions,
    p_actor_user_id: actor.userId,
    p_actor_display_name: actor.displayName,
    p_actor_role: actor.role,
    p_reason_code: reasonCode,
  });

  if (error) throw new Error(`[leads] 안전 담당자 배정 실패: ${error.message}`);
  const updated = ((data ?? []) as Lead[]).map(supabaseToLegacy);
  if (updated.length !== uniqueIds.length) throw new Error("[leads] guarded assignment count mismatch");
  return returnAfterLeadMutation(updated);
}

/* ─── DELETE ─── */

export async function deleteLead(id: string): Promise<boolean> {
  if (!USE_SUPABASE) {
    const { deleteLead: jsonDeleteLead } = await import("@/lib/db");
    const deleted = jsonDeleteLead(id);
    return deleted ? returnAfterLeadMutation(true) : false;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);

  return error ? false : returnAfterLeadMutation(true);
}

/* ─── 집계 ─── */

export async function getLeadStats() {
  if (!USE_SUPABASE) {
    const leads = await getLeads();
    const total = leads.length;
    const byStatus = {
      new: leads.filter((l) => l.status === "new").length,
      contacted: leads.filter((l) => l.status === "contacted").length,
      converted: leads.filter((l) => l.status === "converted").length,
      closed: leads.filter((l) => l.status === "closed").length,
    };
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = leads.filter((l) => l.timestamp.startsWith(today)).length;
    return { total, byStatus, todayCount };
  }

  const supabase = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const [totalRes, newRes, contactedRes, convertedRes, closedRes, todayRes] =
    await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "contacted"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "converted"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "closed"),
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00Z`),
    ]);

  return {
    total: totalRes.count ?? 0,
    byStatus: {
      new: newRes.count ?? 0,
      contacted: contactedRes.count ?? 0,
      converted: convertedRes.count ?? 0,
      closed: closedRes.count ?? 0,
    },
    todayCount: todayRes.count ?? 0,
  };
}

export async function getLeadActionStats(now = new Date()): Promise<LeadActionStats> {
  let leads: LeadRecord[];
  if (!USE_SUPABASE) {
    leads = await getLeads();
  } else {
    // 과거 구현은 KPI 하나를 위해 exact count 10개를 병렬 호출해 실제 214행에서도 약 3초가
    // 걸렸다. 경량 전량 조회 1회로 상태·SLA·팔로업·확인을 같은 스냅샷에서 접어 응답 속도와
    // 지표 일관성을 함께 지킨다. fetchAllLeadRows가 1천행 경계를 페이지네이션한다.
    const columns = "id, source, name, org, email, status, created_at, follow_up_at, confirmed_at";
    try {
      leads = (await fetchAllLeadRows(columns, "액션 KPI 조회")).map(supabaseToLegacy);
    } catch (error) {
      if (!(error instanceof LeadQueryError) || !isMissingLeadColumn(error.supabaseError, "confirmed_at")) {
        throw error;
      }
      leads = (
        await fetchAllLeadRows(columns.replace(", confirmed_at", ""), "액션 KPI 조회")
      ).map(supabaseToLegacy);
    }
  }

  const today = toLocalDateKey(now);
  const responseStatus = summarizeLeadResponseStatus(leads, now);
  const stats: LeadActionStats = {
    total: leads.length,
    byStatus: { new: 0, contacted: 0, converted: 0, closed: 0 },
    unrespondedCount: responseStatus.awaitingResponseCount,
    unresponded24hCount: responseStatus.over24hCount,
    unresponded48hCount: responseStatus.over48hCount,
    todayFollowUpCount: 0,
    overdueFollowUpCount: 0,
    unconfirmedCount: 0,
  };

  for (const lead of leads) {
    stats.byStatus[lead.status] += 1;
    if (!lead.confirmed_at) stats.unconfirmedCount += 1;
    if (!lead.follow_up_at || !isActiveLeadStatus(lead.status)) continue;
    const followUpDate = toLocalDateKey(lead.follow_up_at);
    if (followUpDate === today) stats.todayFollowUpCount += 1;
    if (followUpDate < today) stats.overdueFollowUpCount += 1;
  }

  return stats;
}

export interface LeadChannelStat {
  source: string;
  total: number;
  converted: number;
  rate: number;
}

// 채널(source)별 전환율 — leads의 source+status 단일 조회로 집계. 상위 N개(건수순).
export async function getLeadChannelStats(limit = 8): Promise<LeadChannelStat[]> {
  let rows: Array<{ source: string | null; status: string }>;
  if (!USE_SUPABASE) {
    const leads = await getLeads();
    rows = leads.map((lead) => ({ source: lead.source ?? null, status: lead.status }));
  } else {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("leads").select("source, status");
    if (error) throw new Error(`[leads] 채널 집계 실패: ${error.message ?? "unknown database error"}`);
    rows = (data ?? []) as Array<{ source: string | null; status: string }>;
  }

  const map = new Map<string, { total: number; converted: number }>();
  for (const row of rows) {
    const key = (row.source && row.source.trim()) || "기타";
    const agg = map.get(key) ?? { total: 0, converted: 0 };
    agg.total += 1;
    if (row.status === "converted") agg.converted += 1;
    map.set(key, agg);
  }

  return Array.from(map.entries())
    .map(([source, value]) => ({
      source,
      total: value.total,
      converted: value.converted,
      rate: value.total > 0 ? value.converted / value.total : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
