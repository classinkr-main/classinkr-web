import "server-only"

// 현황 "오늘 연락"(C안 ①, 2026-09-25) — 원천 조립 저장소. 판단(병합·제외·레인·정렬·진행률)은 순수 모듈
// lib/crm/today-contact-queue.ts 가 하고, 여기서는 원천을 모아 넘기기만 한다.
//
// 원천과 캐시
//  1. 후보 풀 = lib/repositories/crm-priority-queue.ts getCrmPriorityCandidatePool — 우선순위 큐와 같은
//     unstable_cache 스냅샷(leads·NEO·활성 할 일 200건·참여 신호·Compass 데모)을 그대로 탄다. 할 일 200건은 미래 다음
//     연락 표시에만 기대고, 오늘 대상 할 일은 아래 보조 원천의 전량 조회가 정본이다(상한에 닿으면 tasksOk=false · 경고).
//  2. Home 보조 원천(연락 인덱스·오늘 닫힌 할 일·오늘 대상 할 일) = 이 파일의 unstable_cache 60초(키 = 오늘 날짜·범위,
//     태그 = 큐 스냅샷 + 오늘 연락). **실패도 라벨을 붙여 그대로 저장한다**(homeContacts=null · closedTasksOk=false ·
//     todayTasks=null → sources·경고). 실패를 던져 저장을 건너뛰면 Next 가 만료된 옛 완성 엔트리를 계속 돌려주고
//     (백그라운드 재계산 오류는 삼킨다) 쓰기 뒤 'max' 무효화도 먹히지 않아, 원천이 끊긴 동안 옛 스냅샷이
//     homeContactsOk=true 로 고착된다(1라운드 교훈 · crm-unified-customers.ts 연락 세부와 같은 처리). 라벨 붙은 강등은
//     60초마다 다시 읽혀 원천이 돌아오면 바로 바뀐다.
//     할 일 쓰기(만들기·완료·미루기·취소·재개·편집·재배정 — 할 일 라우트·세그먼트 "오늘 연락에 넣기"·결과 기록)는
//     저장소 한 곳(lib/repositories/crm-tasks.ts notifyCrmTasksMutated)에서 오늘 연락 태그를 **즉시 만료**한다 — 다음
//     읽기가 방금 바꾼 할 일을 본다. 후보 풀은 SWR 로 한 번 늦을 수 있어, 오늘 닫힌 할 일은 풀 사본을 지우고 오늘 대상
//     할 일은 풀 사본을 덮는다(mergeTodayContactTasks).
//  3. Compass(다음 액션 기간 조회·전화 키 리드 인덱스·최신 사람 활동)는 **Data Cache 밖**에서 부른다 — 브리지 메모
//     (60초, 끊김 10초)만 탄다. 실패는 sources.compass="down"|"partial" 로만 알리고 스냅샷 미완성 판정에 넣지 않는다
//     (1라운드 교훈: 보조 원천 실패가 complete 판정에 들어가면 unstable_cache 가 옛 스냅샷에 고착된다).
//
// 쓰기는 없다(결과 기록은 app/api/admin/crm/home/today-contacts/outcome 라우트가 기존 저장소 함수로 한다).

import { revalidateTag, unstable_cache } from "next/cache"

import {
  ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG,
  ADMIN_CRM_TODAY_CONTACTS_CACHE_TAG,
} from "@/lib/admin/crm/cache-tags"
import {
  getCompassLatestActivityByPhoneKeys,
  getCompassLeadIndexByPhoneKeys,
  getCompassNextActionsInRange,
} from "@/lib/compass/bridge"
import { COMPASS_NEXT_ACTION_LOOKBACK_DAYS } from "@/lib/compass/next-actions"
import {
  COMPASS_CONTACT_EXCLUDED_ACTORS,
  COMPASS_CONTACT_KINDS,
  buildCompassContactIndex,
  type LastContactFact,
} from "@/lib/crm/last-contact"
import {
  buildTodayContacts,
  collectTodayContactPhoneKeys,
  todayContactDateKey,
  todayContactKstDayStart,
} from "@/lib/crm/today-contact-queue"
import type { CrmTodayContacts } from "@/lib/crm/today-contact-types"
import { TODAY_CONTACTS_LIMIT, TODAY_CONTACTS_MAX_LIMIT } from "@/lib/crm/today-contacts-request"
import { loadHomeContactIndex } from "@/lib/repositories/crm-contact-index"
import { listConfirmedLeadNeoAccountLinks } from "@/lib/repositories/crm-source-links"
import { getCrmPriorityCandidatePool } from "@/lib/repositories/crm-priority-queue"
import {
  listCrmTasksClosedSince,
  listCrmTasksDueForToday,
  toCrmTaskRecord,
  type CrmTaskRecord,
  type CrmTaskTargetType,
} from "@/lib/repositories/crm-tasks"
import { shareInFlight } from "@/lib/server/share-in-flight"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { CrmTask, LeadContactLog } from "@/lib/supabase/database.types"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compass 다음 액션은 두 조회로 나눠 읽는다(한 조회로 2020년부터 오름차순으로 읽으면 상한 2,000행에서 **오늘·최근**
 * 행이 먼저 잘린다 — 목록이 옛 액션에 밀려 조용히 비는 결함).
 *  1. 목록 조회 = [오늘 00:00 KST − 14일, 오늘 끝] — 목록에 올릴 행만. 창이 좁아 상한에 닿지 않는다(닿으면 partial).
 *  2. 건수 조회 = [COMPASS_DUE_FLOOR_ISO, 목록 창 시작] 내림차순 — 14일 넘게 지난 건수(counts.compassOverdueBeyondLookback)
 *     전용. 담당 필터·열린 액션 판정을 순수 모듈이 같은 규칙으로 걸어야 해서 count(head) 대신 행을 읽는다. 잘리면 가장
 *     오래된 행부터 빠지고 건수는 하한(partial). 경계 행(창 시작 시각)은 양쪽에 올 수 있어 순수 모듈이 id 로 한 번만 센다.
 */
const COMPASS_DUE_FLOOR_ISO = "2020-01-01T00:00:00.000Z"

export interface GetCrmTodayContactsOptions {
  limit?: number
  /** 담당 이름(목록 셀렉트 값). ownerKeys 와 함께 쓰면 합집합. */
  owner?: string | null
  /** 해석된 담당 키(라우트가 '__me' 를 findAdminCrmOwner 로 푼 값). */
  ownerKeys?: string[] | null
  /** 처리된 행도 싣는가(기본 true). */
  includeHandled?: boolean
  /** 새로고침(?force=1) — 후보 풀·보조 원천 Data Cache 를 우회하고 태그를 즉시 만료한다. */
  force?: boolean
  now?: Date
}

// ── Home 보조 원천(연락 인덱스 · 오늘 닫힌 할 일 · 오늘 대상 할 일) ─────────────────

/** Data Cache(JSON) 경계를 넘는 값 — Map 대신 엔트리 배열. 실패는 null·false 라벨로 그대로 싣는다(던지지 않는다). */
interface TodayContactsHomeAux {
  /** null = 연락 인덱스를 읽지 못함 */
  homeContacts: Array<[string, LastContactFact]> | null
  closedTasksToday: CrmTaskRecord[]
  closedTasksOk: boolean
  /** 오늘 대상이 될 수 있는 활성 할 일 전량(lib/repositories/crm-tasks listCrmTasksDueForToday). null = 읽지 못함 */
  todayTasks: CrmTaskRecord[] | null
  /** 오늘 대상 할 일이 상한에서 잘렸다 — 받은 만큼만 반영했다 */
  todayTasksTruncated: boolean
  warnings: string[]
}

async function loadHomeAux(sinceIso: string, todayEndIso: string): Promise<TodayContactsHomeAux> {
  const [indexResult, closedResult, dueResult] = await Promise.allSettled([
    loadHomeContactIndex(),
    listCrmTasksClosedSince(sinceIso),
    listCrmTasksDueForToday(sinceIso, todayEndIso),
  ])
  const warnings: string[] = []
  let homeContacts: Array<[string, LastContactFact]> | null = null
  if (indexResult.status === "fulfilled") {
    homeContacts = [...indexResult.value.entries()]
  } else {
    console.error("[crm-today-contacts] home contact index failed", indexResult.reason)
  }
  let closedTasksToday: CrmTaskRecord[] = []
  let closedTasksOk = false
  if (closedResult.status === "fulfilled" && closedResult.value.health.ok) {
    closedTasksToday = closedResult.value.rows
    closedTasksOk = !closedResult.value.truncated
    if (closedResult.value.truncated) warnings.push("오늘 닫은 할 일이 많아 일부만 진행률에 반영했습니다.")
  } else if (closedResult.status === "rejected") {
    console.error("[crm-today-contacts] closed tasks failed", closedResult.reason)
  }
  let todayTasks: CrmTaskRecord[] | null = null
  let todayTasksTruncated = false
  if (dueResult.status === "fulfilled" && dueResult.value.health.ok) {
    todayTasks = dueResult.value.rows
    todayTasksTruncated = dueResult.value.truncated
    if (todayTasksTruncated) warnings.push("오늘 할 일이 많아 일부만 목록에 반영했습니다.")
  } else {
    if (dueResult.status === "rejected") console.error("[crm-today-contacts] today tasks failed", dueResult.reason)
    warnings.push("오늘 할 일을 모두 읽지 못해 일부 할 일이 빠졌을 수 있습니다.")
  }
  return { homeContacts, closedTasksToday, closedTasksOk, todayTasks, todayTasksTruncated, warnings }
}

// 실패도 라벨을 붙여 저장한다(위 머리 주석 2) — 이 함수는 던지지 않는다.
const getCachedHomeAux = unstable_cache(
  async (dateKey: string, sinceIso: string, todayEndIso: string) =>
    shareInFlight(`${ADMIN_CRM_TODAY_CONTACTS_CACHE_TAG}:${dateKey}:${sinceIso}`, () => loadHomeAux(sinceIso, todayEndIso)),
  [ADMIN_CRM_TODAY_CONTACTS_CACHE_TAG, "home-aux-v2"],
  {
    revalidate: 60,
    // 리드·할 일·연락 로그 쓰기는 큐 스냅샷 태그를 직접 친다 — 그 태그를 함께 달아 자동으로 따라오게 한다.
    tags: [ADMIN_CRM_PRIORITY_QUEUE_SNAPSHOT_CACHE_TAG, ADMIN_CRM_TODAY_CONTACTS_CACHE_TAG],
  }
)

async function getHomeAux(
  dateKey: string,
  sinceIso: string,
  todayEndIso: string,
  bypassCache: boolean
): Promise<TodayContactsHomeAux> {
  if (bypassCache) return loadHomeAux(sinceIso, todayEndIso)
  try {
    return await getCachedHomeAux(dateKey, sinceIso, todayEndIso)
  } catch (error) {
    console.error("[crm-today-contacts] home aux cache read failed", error)
    return loadHomeAux(sinceIso, todayEndIso)
  }
}

/**
 * 후보 풀 할 일(상한 200)과 오늘 대상 할 일 전량을 id 로 합친다 — 같은 할 일은 오늘 대상 조회 쪽 값을 쓴다.
 * 오늘 닫힌(완료·취소) 할 일은 풀에서 뺀다(2026-09-26 교차 리뷰 [Q2-15]). 풀은 큐 스냅샷(쓰기 뒤 SWR — 다음 한 번은 옛 값)
 * 이라 방금 닫은 할 일이 아직 "열림"으로 남아 있을 수 있다 — 그대로 두면 처리 흔적과 함께 대기 사유·openTaskIds 로도
 * 서 버린다. 보조 원천(오늘 대상·오늘 닫힘)은 할 일 쓰기마다 즉시 만료돼 새 값이다(lib/repositories/crm-tasks.ts
 * notifyCrmTasksMutated) — 오늘 바뀐 할 일은 이 둘이 정본이다.
 */
function mergeTodayContactTasks(
  poolTasks: readonly CrmTaskRecord[],
  todayTasks: readonly CrmTaskRecord[],
  closedTasksToday: readonly CrmTaskRecord[] = []
): CrmTaskRecord[] {
  const closedIds = new Set(closedTasksToday.map((task) => task.id))
  const byId = new Map<string, CrmTaskRecord>()
  for (const task of poolTasks) if (!closedIds.has(task.id)) byId.set(task.id, task)
  for (const task of todayTasks) byId.set(task.id, task)
  return [...byId.values()]
}

/** 오늘 연락 보조 캐시 태그를 무효화한다 — 결과 기록 직후에는 즉시 만료(다음 읽기가 새 값을 본다). */
export function invalidateCrmTodayContacts(mode: "max" | "expire" = "max") {
  try {
    revalidateTag(ADMIN_CRM_TODAY_CONTACTS_CACHE_TAG, mode === "expire" ? { expire: 0 } : "max")
  } catch (error) {
    console.warn("[crm-today-contacts] cache invalidation failed:", error)
  }
}

function clampLimit(limit: number | undefined): number {
  const numeric = Number(limit ?? TODAY_CONTACTS_LIMIT)
  if (!Number.isFinite(numeric) || numeric <= 0) return TODAY_CONTACTS_LIMIT
  return Math.min(Math.floor(numeric), TODAY_CONTACTS_MAX_LIMIT)
}

// ── 조립 ──────────────────────────────────────────────────────────────────────

export async function getCrmTodayContacts(options: GetCrmTodayContactsOptions = {}): Promise<CrmTodayContacts> {
  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  const force = options.force === true
  const bypassCache = options.now != null || force
  const todayStart = todayContactKstDayStart(nowMs)
  const sinceIso = new Date(todayStart).toISOString()
  const todayEndIso = new Date(todayStart + DAY_MS - 1).toISOString()
  const lookbackStartIso = new Date(todayStart - COMPASS_NEXT_ACTION_LOOKBACK_DAYS * DAY_MS).toISOString()
  const dateKey = todayContactDateKey(nowMs)

  // 1단계 — 캐시된 후보 풀·Home 보조 원천과 Compass 다음 액션 두 조회(목록 창·14일 넘은 건수, 캐시 밖)를 병렬로.
  const [pool, aux, due, beyond, neoRegistered] = await Promise.all([
    getCrmPriorityCandidatePool({ now: options.now, force }),
    getHomeAux(dateKey, sinceIso, todayEndIso, bypassCache),
    getCompassNextActionsInRange(lookbackStartIso, todayEndIso),
    getCompassNextActionsInRange(COMPASS_DUE_FLOOR_ISO, lookbackStartIso, { order: "desc" }),
    // NEO 등록 확정 리드(360·리드 보드와 같은 기록 위치 판정 입력) — 실패하면 모름(Compass 우선, 기존 동작).
    listConfirmedLeadNeoAccountLinks().then(
      (links) => new Set(links.keys()),
      (error: unknown) => {
        console.warn("[crm-today-contacts] NEO 등록 리드 조회 실패 — 기록 위치를 Compass 우선으로 판정", error)
        return null
      }
    ),
  ])
  if (force) invalidateCrmTodayContacts("expire")

  // 할 일 = 후보 풀(상한 200, 미래 다음 연락용) + 오늘 대상 할 일 전량(보조 원천). 오늘 대상 조회가 실패했거나 잘렸으면
  // 목록이 할 일을 다 담았다고 말하지 않는다(tasksOk=false → 화면이 주간 패널의 지난·오늘 버킷을 다시 보인다).
  const tasks = mergeTodayContactTasks(pool.tasks, aux.todayTasks ?? [], aux.closedTasksToday)
  const tasksOk = pool.tasksOk && aux.todayTasks != null && !aux.todayTasksTruncated

  // 2단계 — 행이 될 수 있는 엔티티의 전화 키(진행 중 리드·할 일 대상 리드(상태 무관)·NEO 계정·Compass 다음 액션 행)로
  // Compass 리드 인덱스·최신 사람 활동. 전화 키는 서버 안 조인에만 쓴다(응답에 싣지 않는다).
  const keyList = collectTodayContactPhoneKeys({
    leads: pool.leads,
    neoRows: pool.neoRows,
    tasks,
    closedTasksToday: aux.closedTasksToday,
    dueRows: due.down ? null : due.rows,
  })
  const [leadIndex, latest] = await Promise.all([
    getCompassLeadIndexByPhoneKeys(keyList),
    getCompassLatestActivityByPhoneKeys(keyList, {
      kinds: COMPASS_CONTACT_KINDS,
      excludeActors: COMPASS_CONTACT_EXCLUDED_ACTORS,
    }),
  ])

  const ownerKeys = [...(options.ownerKeys ?? []), options.owner ?? ""]
    .map((value) => value.trim())
    .filter(Boolean)

  return buildTodayContacts({
    now,
    leads: pool.leads,
    neoRows: pool.neoRows,
    tasks,
    closedTasksToday: aux.closedTasksToday,
    engagements: pool.engagements,
    demoIndex: pool.demoIndex,
    homeContacts: aux.homeContacts ? new Map(aux.homeContacts) : null,
    neoRegisteredLeadIds: neoRegistered,
    compass: {
      dueActions: due.down ? null : due.rows,
      dueTruncated: due.truncated,
      beyondLookback: beyond.down ? null : beyond.rows,
      beyondLookbackTruncated: beyond.truncated,
      leadIndex: leadIndex.down ? null : leadIndex.rows,
      leadIndexTruncated: leadIndex.truncated === true,
      latestContacts: latest.down ? null : buildCompassContactIndex(latest.rows),
      latestTruncated: latest.truncated === true,
    },
    sources: {
      leadsOk: pool.leadsOk,
      neoAccountsOk: pool.neoAccountsOk,
      tasksOk,
      closedTasksOk: aux.closedTasksOk,
    },
    neoSync: { latestSyncedAt: pool.neoLatestSyncedAt, stale: pool.neoStale },
    warnings: [...pool.warnings, ...aux.warnings],
    ownerKeys,
    limit: clampLimit(options.limit),
    includeHandled: options.includeHandled !== false,
  })
}

// ── 결과 기록 라우트 보조 조회(쓰기 없음 · 캐시 없음 — 방금 쓴 값을 봐야 한다) ─────────────

/** 대상의 활성(open·snoozed) 할 일 — 미루기 모드가 이 행의 오늘 할 일을 찾을 때. 실패는 던진다. */
export async function listActiveTasksForTodayContactTarget(
  targetType: CrmTaskTargetType,
  targetId: string
): Promise<CrmTaskRecord[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .in("status", ["open", "snoozed"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(50)
  if (error) throw new Error(`[crm-today-contacts] 대상 할 일 조회 실패: ${error.message}`)
  return ((data ?? []) as CrmTask[]).map(toCrmTaskRecord)
}

/**
 * 같은 대상·같은 기한으로 방금(sinceIso 이후) 만든 열린 할 일 — 미루기 재전송(더블 클릭·네트워크 재시도)이
 * 다음 일정 할 일을 두 번 만들지 않게 한다. 조회 실패는 null(막지 않음 — 중복 방지가 저장을 깨뜨리면 안 된다).
 */
export async function findRecentTodayContactTask(
  targetType: CrmTaskTargetType,
  targetId: string,
  dueAtIso: string,
  sinceIso: string
): Promise<CrmTaskRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "open")
    .eq("due_at", dueAtIso)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return toCrmTaskRecord(data as CrmTask)
}

/** 리드의 연락 로그 한 건(되돌리기 검증용 — 시각·작성자) — 없으면 null, 실패는 던진다. */
export async function getTodayContactLeadLog(
  leadId: string,
  logId: string
): Promise<{ id: string; contactedAt: string; contactedBy: string | null } | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("lead_contact_logs")
    .select("id, lead_id, contacted_at, contacted_by")
    .eq("id", logId)
    .eq("lead_id", leadId)
    .maybeSingle()
  if (error) throw new Error(`[crm-today-contacts] 연락 로그 조회 실패: ${error.message}`)
  if (!data) return null
  const row = data as Pick<LeadContactLog, "id" | "contacted_at" | "contacted_by">
  return { id: row.id, contactedAt: row.contacted_at, contactedBy: row.contacted_by ?? null }
}

export interface TodayContactSourceEventRow {
  id: string
  /** 기록 종류(call·sms) — 결과 저장 재전송이 채널을 바꿔도 첫 기록을 가리키게 한다. */
  sourceType: "call" | "sms"
  createdAt: string
  occurredAt: string
  createdBy: string | null
}

/**
 * 오늘 연락 결과 기록(계정·고객·딜 — source_id = 'today-contact:<requestId>', call·sms)의 행(먼저 만든 것부터).
 *  - 되돌리기가 지우기 전에 작성자·나이를 확인한다(요청 키만 알면 남의 옛 기록을 지울 수 있게 두지 않는다).
 *  - 결과 저장이 먼저 부른다 — 같은 요청 키의 기록이 다른 종류(전화 ↔ 문자)로 이미 있으면 그 종류로 찾게 해, 재전송에서
 *    채널을 고쳐도 두 번째 기록을 만들지 않는다(getOrCreate…BySource 는 source_type + source_id 로만 찾는다).
 * 없으면 빈 배열, 실패는 던진다.
 */
export async function listTodayContactEventsBySource(
  sourceId: string,
  targetType: CrmTaskTargetType,
  targetId: string
): Promise<TodayContactSourceEventRow[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_customer_events")
    .select("id, source_type, created_at, occurred_at, created_by")
    .in("source_type", ["call", "sms"])
    .eq("source_id", sourceId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(10)
  if (error) throw new Error(`[crm-today-contacts] 결과 기록 조회 실패: ${error.message}`)
  type Row = { id: string; source_type: string; created_at: string; occurred_at: string; created_by: string | null }
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    sourceType: row.source_type === "sms" ? "sms" : "call",
    createdAt: row.created_at,
    occurredAt: row.occurred_at,
    createdBy: row.created_by ?? null,
  }))
}

/**
 * 방금 이 사람이 미루기로 닫은(취소 + 같은 "미룸 → 다음 MM-DD" 문구) 이 대상의 할 일 — 미루기 재전송이 첫 요청의
 * closedTaskIds 를 그대로 돌려주게 한다(되돌리기가 원래 할 일을 다시 열 수 있게). 조회 실패는 빈 배열(막지 않음).
 */
export async function listRecentTodayContactSnoozedTasks(
  targetType: CrmTaskTargetType,
  targetId: string,
  filter: { outcome: string; completedBy: string; sinceIso: string }
): Promise<CrmTaskRecord[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "canceled")
    .eq("outcome", filter.outcome)
    .eq("completed_by", filter.completedBy)
    .gte("completed_at", filter.sinceIso)
    .order("completed_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(20)
  if (error || !data) return []
  return (data as CrmTask[]).map(toCrmTaskRecord)
}
