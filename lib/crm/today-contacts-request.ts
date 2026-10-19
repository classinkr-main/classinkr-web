/**
 * 현황 "오늘 연락" 패널(클라이언트)과 CRM 홈 서버 프리페치(lib/admin/crm/today-contacts-prefetch.ts)가
 * 같은 요청 조건·캐시 키를 만들도록 공유하는 중립 모듈 — "server-only"도 "use client"도 달지 않는다
 * (서버 번들이 패널 컴포넌트의 클라이언트 전용 import 를 끌고 들어오지 않게 값·URL 조립 규칙만 담는다 —
 * 옛 우선순위 큐 패널의 priority-queue-request.ts 와 같은 이유. 그 모듈은 큐 패널·프리페치와 함께 지웠다,
 * 2026-10-19 09-mooni 병합. 큐 API 라우트·getCrmPriorityQueue 는 오늘 연락이 읽어 남아 있다).
 *
 * 주의: lib/crm/today-contacts.ts 의 TODAY_CONTACTS_LIMIT(컴포저 칩 상한 4)와는 다른 값이다 —
 * 이름이 같아도 모듈이 달라 섞이지 않는다.
 */

import type { CrmTodayContacts } from "@/lib/crm/today-contact-types"

/**
 * 오늘 연락 목록 행 상한(서버 응답) — 넘치면 응답 truncated.rows=true, 전체 건수는 progress.total 로 알린다.
 * 화면은 첫 10행(끼워 넣기 패턴 2바퀴)만 펼치고 나머지는 "남은 N건 더 보기"로 접는다.
 */
export const TODAY_CONTACTS_LIMIT = 60

/** 서버가 받는 상한의 최댓값(쿼리스트링 조작 방지). */
export const TODAY_CONTACTS_MAX_LIMIT = 150

export const TODAY_CONTACTS_API_PATH = "/api/admin/crm/home/today-contacts"
export const TODAY_CONTACTS_OUTCOME_API_PATH = "/api/admin/crm/home/today-contacts/outcome"

/** 패널의 기본 담당 — 로그인 사용자("내 담당"). 서버는 owner 생략도 같은 뜻으로 읽는다(lib/admin/data-owner). */
export const TODAY_CONTACTS_DEFAULT_OWNER = "__me"

/**
 * GET URL. owner 는 늘 싣는다 — "__me"(기본)면 서버가 요청자 담당 키로 풀고, 빈 값("")이면 담당 전체, 그 밖은
 * 담당 이름이다(priority-queue 라우트와 같은 규칙 — 3f5f0a21 "생략은 개인, 명시적 빈 owner 는 전체"). 그래서 전체는
 * owner= 를 비운 채로 명시한다(생략하면 서버가 개인으로 읽는다).
 * v 는 페이로드 모양이 바뀔 때 올려 이전 클라이언트 캐시와 섞이지 않게 한다. 처리된 행은 기본으로 싣는다
 * (includeHandled=0 이면 뺀다 — 진행률은 그대로).
 */
export function todayContactsUrl(owner: string = TODAY_CONTACTS_DEFAULT_OWNER, limit: number = TODAY_CONTACTS_LIMIT): string {
  const params = new URLSearchParams({ limit: String(limit), v: "1" })
  params.set("owner", owner.trim())
  return `${TODAY_CONTACTS_API_PATH}?${params.toString()}`
}

type TodayContactsRequiredSources = Pick<CrmTodayContacts["sources"], "leadsOk" | "neoAccountsOk" | "tasksOk" | "homeContactsOk">

/**
 * 이 응답을 브라우저·화면 캐시에 둬도 되는가 — Home 필수 원천(리드·NEO 계정·할 일·Home 연락)이 모두 읽혔을 때만.
 * 하나라도 못 읽은 강등 응답을 캐시에 두면 원천이 돌아와도 캐시 수명 동안 "리드 없음(경고)" 목록이 남는다(공통 규약:
 * 읽기 오류 결과를 정상 캐시에 저장하지 않는다). Compass 끊김·부분은 판정에서 뺀다 — 메타로만 알리는 외부 원천이다
 * (1라운드 교훈). 라우트(Cache-Control: no-store)와 화면(클라이언트 캐시 삭제)이 같은 판정을 쓴다 — 세그먼트 목록의
 * isSegmentListCacheable 과 같은 패턴. sources 가 없으면(모양이 다른 값) 캐시하지 않는다.
 */
export function isTodayContactsCacheable(
  data: { sources?: Partial<TodayContactsRequiredSources> | null } | null | undefined
): boolean {
  const sources = data?.sources
  if (!sources) return false
  return (
    sources.leadsOk === true &&
    sources.neoAccountsOk === true &&
    sources.tasksOk === true &&
    sources.homeContactsOk === true
  )
}

/** 서버 라우트용 — limit 쿼리 값을 [1, MAX] 로 자른다(NaN·음수는 기본값). */
export function parseTodayContactsLimit(raw: string | null | undefined): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return TODAY_CONTACTS_LIMIT
  return Math.min(parsed, TODAY_CONTACTS_MAX_LIMIT)
}
