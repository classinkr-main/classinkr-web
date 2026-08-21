/**
 * Leads Repository — JSON ↔ Supabase 듀얼 모드
 *
 * 환경변수 USE_SUPABASE_LEADS=true 로 Supabase 전환
 * 기존 lib/db.ts 의 함수 시그니처를 최대한 유지
 */

import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Lead, LeadInsert, LeadUpdate } from "@/lib/supabase/database.types";

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
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const RESPONSE_TARGET_SOURCES = ["demo_modal", "contact_page", "meta_lead_ads"] as const;
const ACTIVE_LEAD_STATUSES = ["new", "contacted"] as const;
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
] as const satisfies readonly (keyof LeadInsert)[];

interface SupabaseColumnError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
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

function getLocalDayBounds(value: Date) {
  const [year, month, day] = toLocalDateKey(value).split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { start, end };
}

function isActiveLeadStatus(status: LeadRecord["status"]) {
  return status !== "converted" && status !== "closed";
}

function isResponseTargetSource(source: string) {
  return RESPONSE_TARGET_SOURCES.includes(source as (typeof RESPONSE_TARGET_SOURCES)[number]);
}

function isUnrespondedLeadRecord(lead: LeadRecord) {
  return lead.status === "new" && isResponseTargetSource(lead.source);
}

function getSupabaseCountError(
  results: Array<{ error: { message?: string } | null }>
) {
  return results.find((result) => result.error)?.error ?? null;
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

function isMissingLeadColumn(error: SupabaseColumnError, column: keyof LeadInsert) {
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
function stripOptionalLeadColumns(insert: LeadInsert, error?: SupabaseColumnError) {
  const fallbackInsert: Partial<LeadInsert> = { ...insert };

  const named = error
    ? OPTIONAL_LEAD_INSERT_COLUMNS.filter((column) => isMissingLeadColumn(error, column))
    : [];
  const doomed = named.length > 0 ? named : OPTIONAL_LEAD_INSERT_COLUMNS;

  for (const column of doomed) {
    delete fallbackInsert[column];
  }

  return fallbackInsert;
}

function supabaseToLegacy(row: Lead): LeadRecord {
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

async function fetchAllLeadRows(columns: string, label: string): Promise<Lead[]> {
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
const MARKETING_LEAD_COLUMNS = [
  "id", "source", "name", "org", "role", "email", "phone", "message", "status",
  "branch", "notes", "source_detail", "lead_magnet", "follow_up_at", "assigned_to",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "msclkid", "ttclid", "landing_page", "current_page",
  "created_at", "confirmed_at",
].join(", ");

// confirmed_at 마이그레이션 전 배포 창에서도 화면이 깨지지 않게 — 대시보드 조회와 같은 폴백.
const MARKETING_LEAD_COLUMNS_WITHOUT_CONFIRMED = MARKETING_LEAD_COLUMNS.replace(", confirmed_at", "");

export async function getMarketingLeads(): Promise<LeadRecord[]> {
  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    return jsonGetLeads();
  }

  try {
    const rows = await fetchAllLeadRows(MARKETING_LEAD_COLUMNS, "마케팅 조회");
    return rows.map(supabaseToLegacy);
  } catch (error) {
    if (!(error instanceof LeadQueryError) || !isMissingLeadColumn(error.supabaseError, "confirmed_at")) {
      throw error;
    }
    const fallback = await fetchAllLeadRows(MARKETING_LEAD_COLUMNS_WITHOUT_CONFIRMED, "마케팅 조회");
    return fallback.map(supabaseToLegacy);
  }
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
 * 등록 전 중복 검사용 — 전화/이메일이 일치할 수 있는 기존 리드의 최소 컬럼만 가져온다.
 * DB에는 하이픈 포함 전화가 흔해 원문만으로는 "010-1234-5678"과 "01012345678"을 다른
 * 번호로 오인한다. in 목록에 원문과 숫자만 남긴 정규화형을 함께 넣어 그 차이를 흡수하고,
 * 최종 판정(정규화 비교)은 호출부가 한다. 이메일도 원문·소문자형을 함께 조회한다.
 */
export async function findLeadsByContacts(contacts: {
  phones: string[];
  emails: string[];
}): Promise<Pick<LeadRecord, "id" | "phone" | "email">[]> {
  const phones = contacts.phones.map((phone) => phone.trim()).filter(Boolean);
  const emails = contacts.emails.map((email) => email.trim()).filter(Boolean);
  if (phones.length === 0 && emails.length === 0) return [];

  const digitsOnly = (value: string) => value.replace(/\D/g, "");

  if (!USE_SUPABASE) {
    const { getLeads: jsonGetLeads } = await import("@/lib/db");
    const phoneKeys = new Set(phones.map(digitsOnly).filter(Boolean));
    const emailKeys = new Set(emails.map((email) => email.toLowerCase()));
    return jsonGetLeads()
      .filter(
        (lead) =>
          (lead.phone && phoneKeys.has(digitsOnly(lead.phone))) ||
          (lead.email && emailKeys.has(lead.email.toLowerCase()))
      )
      .map((lead) => ({ id: lead.id, phone: lead.phone, email: lead.email }));
  }

  const supabase = createSupabaseAdminClient();
  const phoneCandidates = Array.from(
    new Set(phones.flatMap((phone) => [phone, digitsOnly(phone)]).filter(Boolean))
  );
  const emailCandidates = Array.from(
    new Set(emails.flatMap((email) => [email, email.toLowerCase()]))
  );

  const [phoneRes, emailRes] = await Promise.all([
    phoneCandidates.length > 0
      ? supabase.from("leads").select("id, phone, email").in("phone", phoneCandidates)
      : Promise.resolve({ data: [], error: null }),
    emailCandidates.length > 0
      ? supabase.from("leads").select("id, phone, email").in("email", emailCandidates)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = phoneRes.error ?? emailRes.error;
  if (error) throw new Error(`[leads] 중복 조회 실패: ${error.message}`);

  // 전화·이메일 양쪽에 걸린 리드가 두 번 세이지 않게 id로 합친다.
  const byId = new Map<string, Pick<LeadRecord, "id" | "phone" | "email">>();
  for (const row of [...(phoneRes.data ?? []), ...(emailRes.data ?? [])] as Array<{
    id: string;
    phone: string | null;
    email: string | null;
  }>) {
    byId.set(row.id, {
      id: row.id,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
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
    return jsonSaveLead(lead);
  }

  // 공개 리드 제출은 admin 클라이언트 사용 (RLS: anyone can insert)
  const supabase = createSupabaseAdminClient();

  const insert: LeadInsert = {
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
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(insert)
    .select()
    .single();

  if (error) {
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

      if (!fallback.error) return supabaseToLegacy(fallback.data as Lead);

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
          throw new Error(`[leads] 저장 실패: ${bare.error.message}`);
        }

        return supabaseToLegacy(bare.data as Lead);
      }

      throw new Error(`[leads] 저장 실패: ${fallback.error.message}`);
    }

    throw new Error(`[leads] 저장 실패: ${error.message}`);
  }

  return supabaseToLegacy(data as Lead);
}

/* ─── UPDATE ─── */

export async function updateLead(
  id: string,
  patch: Partial<LeadRecord>
): Promise<LeadRecord | null> {
  if (!USE_SUPABASE) {
    const { updateLead: jsonUpdateLead } = await import("@/lib/db");
    return jsonUpdateLead(id, patch);
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

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error && isMissingLeadColumn(error, "confirmed_at") && update.confirmed_at !== undefined) {
    const fallbackUpdate = { ...update };
    delete fallbackUpdate.confirmed_at;

    if (Object.keys(fallbackUpdate).length === 0) {
      const existing = await getLeadById(id);
      return existing ? { ...existing, confirmed_at: patch.confirmed_at ?? undefined } : null;
    }

    const fallback = await supabase
      .from("leads")
      .update(fallbackUpdate)
      .eq("id", id)
      .select()
      .single();

    if (fallback.error || !fallback.data) return null;
    return {
      ...supabaseToLegacy(fallback.data as Lead),
      confirmed_at: patch.confirmed_at ?? undefined,
    };
  }

  if (error || !data) return null;
  return supabaseToLegacy(data as Lead);
}

/* ─── DELETE ─── */

export async function deleteLead(id: string): Promise<boolean> {
  if (!USE_SUPABASE) {
    const { deleteLead: jsonDeleteLead } = await import("@/lib/db");
    return jsonDeleteLead(id);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);

  return !error;
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
  if (!USE_SUPABASE) {
    const leads = await getLeads();
    const today = toLocalDateKey(now);
    const cutoff24h = now.getTime() - 24 * 3_600_000;
    const cutoff48h = now.getTime() - 48 * 3_600_000;
    const stats: LeadActionStats = {
      total: leads.length,
      byStatus: { new: 0, contacted: 0, converted: 0, closed: 0 },
      unrespondedCount: 0,
      unresponded24hCount: 0,
      unresponded48hCount: 0,
      todayFollowUpCount: 0,
      overdueFollowUpCount: 0,
      unconfirmedCount: 0,
    };

    for (const lead of leads) {
      stats.byStatus[lead.status] += 1;
      if (!lead.confirmed_at) stats.unconfirmedCount += 1;
      if (isUnrespondedLeadRecord(lead)) {
        stats.unrespondedCount += 1;
        const leadTime = new Date(lead.timestamp).getTime();
        if (leadTime <= cutoff24h) {
          stats.unresponded24hCount += 1;
        }
        if (leadTime <= cutoff48h) {
          stats.unresponded48hCount += 1;
        }
      }

      if (!lead.follow_up_at || !isActiveLeadStatus(lead.status)) continue;
      const followUpDate = toLocalDateKey(lead.follow_up_at);
      if (followUpDate === today) stats.todayFollowUpCount += 1;
      if (followUpDate < today) stats.overdueFollowUpCount += 1;
    }

    return stats;
  }

  const supabase = createSupabaseAdminClient();
  const { start, end } = getLocalDayBounds(now);
  const cutoff24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const cutoff48h = new Date(now.getTime() - 48 * 3_600_000).toISOString();

  const [
    totalRes,
    newRes,
    contactedRes,
    convertedRes,
    closedRes,
    unrespondedRes,
    unresponded24hRes,
    unresponded48hRes,
    todayFollowUpRes,
    overdueFollowUpRes,
    unconfirmedRes,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "contacted"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "converted"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "closed"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .in("source", [...RESPONSE_TARGET_SOURCES]),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .in("source", [...RESPONSE_TARGET_SOURCES])
      .lte("created_at", cutoff24h),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .in("source", [...RESPONSE_TARGET_SOURCES])
      .lte("created_at", cutoff48h),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("status", [...ACTIVE_LEAD_STATUSES])
      .gte("follow_up_at", start.toISOString())
      .lt("follow_up_at", end.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("status", [...ACTIVE_LEAD_STATUSES])
      .lt("follow_up_at", start.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).is("confirmed_at", null),
  ]);

  const countResults = [
    totalRes,
    newRes,
    contactedRes,
    convertedRes,
    closedRes,
    unrespondedRes,
    unresponded24hRes,
    unresponded48hRes,
    todayFollowUpRes,
    overdueFollowUpRes,
  ];
  const error = getSupabaseCountError(countResults);
  if (error) throw new Error(`[leads] KPI 조회 실패: ${error.message ?? "unknown database error"}`);

  let unconfirmedCount = unconfirmedRes.count ?? 0;
  if (unconfirmedRes.error) {
    // Some PostgREST head-count errors for a missing filter column come back
    // with an empty message. This branch only covers the confirmed_at probe, so
    // falling back to row-based counting is safer than failing the whole board.
    if (unconfirmedRes.error.message && !isMissingLeadColumn(unconfirmedRes.error, "confirmed_at")) {
      throw new Error(`[leads] KPI 조회 실패: ${unconfirmedRes.error.message ?? "unknown database error"}`);
    }
    const leads = await getLeads();
    unconfirmedCount = leads.filter((lead) => !lead.confirmed_at).length;
  }

  return {
    total: totalRes.count ?? 0,
    byStatus: {
      new: newRes.count ?? 0,
      contacted: contactedRes.count ?? 0,
      converted: convertedRes.count ?? 0,
      closed: closedRes.count ?? 0,
    },
    unrespondedCount: unrespondedRes.count ?? 0,
    unresponded24hCount: unresponded24hRes.count ?? 0,
    unresponded48hCount: unresponded48hRes.count ?? 0,
    todayFollowUpCount: todayFollowUpRes.count ?? 0,
    overdueFollowUpCount: overdueFollowUpRes.count ?? 0,
    unconfirmedCount,
  };
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
