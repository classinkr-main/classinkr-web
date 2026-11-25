import "server-only"

import { unstable_cache } from "next/cache"

import { businessReadDate } from "@/lib/branch/computations/rev-confirmed"
import { fiscalYearMonths } from "@/lib/branch/fiscal"
import {
  mergeLedgerIntoDeals,
  type LedgerDealMergeResult,
  type LedgerOverlayDraft,
  type LedgerOverlayEntry,
  type LedgerOverlaySheetWrite,
} from "@/lib/branch/ledger-overlay"
import { branchManagerMatches } from "@/lib/branch/personal-scope"
import { readRevDealsPreferActiveWithSource, type RevDealsSource } from "@/lib/branch/read-rev-deals"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import {
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
  type BranchSalesLedgerDraft,
  type BranchSalesLedgerEntry,
} from "@/lib/repositories/branch-sales-ledger-drafts"
import {
  isSheetWritesNotReadyError,
  lastSuccessfulRevSyncStartedAt,
  latestSheetWritesByDraftIds,
} from "@/lib/repositories/branch-sales-ledger-sheet-writes"

// 서버 매출 = 시트 행 + 장부 항목(D1, 2026-11-25 결정). 확정 타일·KR Team·KPI·히트맵·주간 보고·AI 인사이트·CRM 매출·
// CRM 성과·고객 360 금액·주간 마감이 모두 이 함수로 REV 딜을 읽는다 — 장부 화면(SalesLedgerWorkbench)과 같은 규칙
// (lib/branch/ledger-overlay.ts planLedgerOverlay)으로 정정은 그 (시트 행, 달)을 대체하고 신규는 더한다.
//
// 입력은 화면과 같다: 그 회계연도 열두 달의 활성 항목 + 항목 없는 적용 초안(안전망) + 상쇄된 초안 id + 시트 쓰기 기록 +
// 마지막 성공 REV 동기화 시작 시각. 달 범위로 끝까지 페이지를 읽는다(F-29 — 1,000건 상한 없음).
//
// 캐시: REV 딜은 각 리더(액티브 임포트·미러)가 자기 태그로 캐시한다. 장부 입력은 여기서 장부 항목·초안·시트 쓰기·동기화
// 런 태그로 60초 캐시한다 — 반영·되돌리기는 항목 태그를 즉시 만료하므로(branch-sales-ledger-drafts.ts) 적용 직후 다음
// 조회가 새 값을 본다. 합치기(mergeLedgerIntoDeals)는 순수 함수라 매 호출 다시 한다(딜 수 × 달, 가볍다).

/**
 * 장부 입력 캐시가 거는 태그 — 이 함수를 감싸는 바깥 캐시(KPI 조립·CRM 매출 등)도 같은 태그를 더한다.
 * 저장소 상수(BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG·…_DRAFTS_…·…_SHEET_WRITES_…·BRANCH_SYNC_RUNS_CACHE_TAG)와 같은 문자열이다 —
 * 모듈을 읽는 순간 그 저장소 모듈을 건드리지 않게 글자로 둔다(tests/branch/ledger-revenue.test.ts 가 드리프트를 막는다).
 */
export const LEDGER_REVENUE_CACHE_TAGS = [
  "branch-sales-ledger-entries",
  "branch-sales-ledger-drafts",
  "branch-sales-ledger-sheet-writes",
  "branch-sync-runs",
] as const

const LEDGER_SOURCES_REVALIDATE_SECONDS = 60

/** 오버레이 입력 묶음(JSON 직렬화 가능 — unstable_cache 값). */
export interface LedgerOverlaySources {
  fiscalYear: number
  months: string[]
  entries: LedgerOverlayEntry[]
  /** 적용(applied) 초안 — 항목이 없는 적용 초안만 안전망으로 얹힌다(화면과 같다). */
  drafts: LedgerOverlayDraft[]
  reversedDraftIds: string[]
  sheetWrites: Record<string, LedgerOverlaySheetWrite>
  lastRevSyncStartedAt: string | null
  /** 장부 항목 표를 읽었다(마이그레이션 전이면 false — 시트만으로 센다). */
  ledgerReadable: boolean
  /** 시트 쓰기 기록을 읽었다(실패면 시트가 이미 읽은 정정을 가리지 못한다 — 이중 계상 쪽으로 틀린다). */
  sheetWritesReadable: boolean
  /** 달 범위 조회가 안전 상한에 닿았다. */
  truncated: boolean
}

function toOverlayEntry(entry: BranchSalesLedgerEntry): LedgerOverlayEntry {
  return {
    id: entry.id,
    draftId: entry.draftId,
    entryType: entry.entryType,
    entryStatus: entry.entryStatus,
    sourceDealId: entry.sourceDealId,
    sourceSheetRow: entry.sourceSheetRow,
    sourceSnapshot: entry.sourceSnapshot,
    customer: entry.customer,
    manager: entry.manager,
    team: entry.team,
    month: entry.month,
    amount: entry.amount,
    note: entry.note,
    appliedAt: entry.appliedAt,
    metadata: entry.metadata,
  }
}

function toOverlayDraft(draft: BranchSalesLedgerDraft): LedgerOverlayDraft {
  return {
    id: draft.id,
    kind: draft.kind,
    status: draft.status,
    sourceDealId: draft.sourceDealId,
    sourceSheetRow: draft.sourceSheetRow,
    sourceSnapshot: draft.sourceSnapshot,
    customer: draft.customer,
    manager: draft.manager,
    team: draft.team,
    month: draft.month,
    amount: draft.amount,
    note: draft.note,
    metadata: draft.metadata,
    appliedAt: draft.appliedAt,
    updatedAt: draft.updatedAt,
  }
}

async function loadLedgerOverlaySources(fiscalYear: number): Promise<LedgerOverlaySources> {
  const months = fiscalYearMonths(fiscalYear)
  const range = { from: months[0], to: months[months.length - 1] }
  // 항목·상쇄·적용 초안은 실패하면 던진다(호출부가 "시트만"으로 내리고 알린다 — 빈 장부를 정상처럼 캐시하지 않는다).
  const [active, reversed, applied, lastRevSync] = await Promise.all([
    listBranchSalesLedgerEntries({ months: range }),
    listBranchSalesLedgerEntries({ status: "reversed", months: range }),
    listBranchSalesLedgerDrafts({ statuses: ["applied"], months: range }),
    lastSuccessfulRevSyncStartedAt().catch((error: unknown) => {
      console.error("[ledger-revenue] 마지막 REV 동기화 시각을 읽지 못함", error)
      return null
    }),
  ])
  const entries = active.entries.map(toOverlayEntry)
  const drafts = applied.drafts.map(toOverlayDraft)
  const reversedDraftIds = [...new Set(reversed.entries.map((entry) => entry.draftId).filter((id): id is string => Boolean(id)))]

  // 시트 쓰기(ADR-011) — 시트가 이미 읽은 정정을 오버레이에서 뺀다. 화면(GET ledger-drafts)과 같은 초안 id 집합.
  let sheetWrites: Record<string, LedgerOverlaySheetWrite> = {}
  let sheetWritesReadable = true
  const draftIds = [...new Set([...entries.map((entry) => entry.draftId), ...drafts.map((draft) => draft.id)].filter((id): id is string => Boolean(id)))]
  if (draftIds.length > 0) {
    try {
      const latest = await latestSheetWritesByDraftIds(draftIds)
      sheetWrites = Object.fromEntries([...latest].map(([draftId, record]) => [draftId, { status: record.status, writtenAt: record.writtenAt }]))
    } catch (error) {
      if (!isSheetWritesNotReadyError(error)) {
        console.error("[ledger-revenue] 시트 쓰기 기록을 읽지 못함", error)
        sheetWritesReadable = false
      }
    }
  }

  return {
    fiscalYear,
    months,
    entries,
    drafts,
    reversedDraftIds,
    sheetWrites,
    lastRevSyncStartedAt: lastRevSync,
    ledgerReadable: active.health.ok,
    sheetWritesReadable,
    truncated: Boolean(active.truncated || reversed.truncated || applied.truncated),
  }
}

const readCachedLedgerOverlaySources = unstable_cache(loadLedgerOverlaySources, ["branch-ledger-overlay-sources-v1"], {
  revalidate: LEDGER_SOURCES_REVALIDATE_SECONDS,
  tags: [...LEDGER_REVENUE_CACHE_TAGS],
})

/** 회계연도 fiscalYear 의 장부 오버레이 입력(캐시). 장부 항목을 못 읽으면 던진다. */
export async function readLedgerOverlaySources(fiscalYear: number): Promise<LedgerOverlaySources> {
  return readCachedLedgerOverlaySources(fiscalYear)
}

export interface LedgerRevenueInfo {
  /** 그 회계연도 활성 장부 항목 수(얹기 전 — 흡수·겹친 정정 포함) */
  entryCount: number
  /** 원본 시트 행을 못 찾아 따로 더한 정정 */
  unresolved: number
  /** 같은 (시트 행, 달)을 더 늦은 정정이 대신해 세지 않은 정정(F-04) */
  superseded: number
  /** 정정 뒤 시트 칸이 바뀐 정정(F-16) */
  drift: number
  /** 시트에도 같은 고객·달 금액이 있는 장부 신규 행(F-16) */
  duplicates: number
  truncated: boolean
  /** false 면 장부 항목을 읽지 못해 시트만으로 셌다(화면은 "시트만"으로 알린다). */
  ledgerReadable: boolean
}

export interface LedgerRevenueDeals {
  /** 시트 행 + 장부 항목(D1) — 전 팀·전 담당. 범위는 호출부가 scopeLedgerRevenueDeals 로 좁힌다. */
  deals: BranchRevDeal[]
  /** 같은 원천의 시트 행만(장부 가감 = deals − sheetOnlyDeals, D3) */
  sheetOnlyDeals: BranchRevDeal[]
  source: RevDealsSource
  info: LedgerRevenueInfo
}

/**
 * REV 딜(액티브 임포트 우선, 없으면 미러)에 장부 오버레이 입력을 얹는다 — 순수(테스트·rev-sheet 워크스페이스가 미러 행에 쓴다).
 * todayYm 은 KST 영업일: 색 없는 딜의 한 달을 제자리 정정할 때 나머지 달의 무색상 폴백을 그날 기준으로 옮겨 적는다
 * (캐논이 읽는 날과 같아야 화면·서버가 같은 값을 낸다).
 */
export function mergeLedgerSources(
  deals: ReadonlyArray<BranchRevDeal>,
  sources: LedgerOverlaySources,
  now: Date = new Date(),
): LedgerDealMergeResult {
  return mergeLedgerIntoDeals(deals, {
    ledgerEntries: sources.entries,
    drafts: sources.drafts,
    reversedDraftIds: new Set(sources.reversedDraftIds),
    sheetWrites: sources.sheetWrites,
    lastRevSyncStartedAt: sources.lastRevSyncStartedAt,
    months: sources.months,
    todayYm: businessReadDate(now).date,
  })
}

function emptyInfo(ledgerReadable: boolean): LedgerRevenueInfo {
  return { entryCount: 0, unresolved: 0, superseded: 0, drift: 0, duplicates: 0, truncated: false, ledgerReadable }
}

/**
 * 회계연도 fiscalYear 의 서버 매출 딜 = 시트 행 + 장부 항목(D1). 장부 항목을 읽지 못하면 시트만 돌려주고
 * info.ledgerReadable=false 로 알린다(조회 실패를 빈 장부로 숨기지 않는다 — 화면이 "시트만"을 말한다).
 */
export async function readLedgerRevenueDeals({ fiscalYear, now = new Date() }: { fiscalYear: number; now?: Date }): Promise<LedgerRevenueDeals> {
  const [rev, sources] = await Promise.all([
    readRevDealsPreferActiveWithSource(fiscalYear, undefined, { withRaw: true }),
    readLedgerOverlaySources(fiscalYear).catch((error: unknown) => {
      console.error("[ledger-revenue] 장부 항목을 읽지 못해 시트만으로 셉니다", error)
      return null
    }),
  ])
  if (!sources) {
    return { deals: rev.deals, sheetOnlyDeals: rev.deals, source: rev.source, info: emptyInfo(false) }
  }
  if (sources.entries.length === 0 && sources.drafts.length === 0) {
    return {
      deals: rev.deals,
      sheetOnlyDeals: rev.deals,
      source: rev.source,
      info: { ...emptyInfo(sources.ledgerReadable), truncated: sources.truncated },
    }
  }
  const merged = mergeLedgerSources(rev.deals, sources, now)
  return {
    deals: merged.deals,
    sheetOnlyDeals: rev.deals,
    source: rev.source,
    info: {
      entryCount: sources.entries.length,
      unresolved: merged.unresolved.length,
      superseded: merged.superseded.length,
      drift: merged.drift.length,
      duplicates: merged.duplicates.length,
      truncated: sources.truncated,
      ledgerReadable: sources.ledgerReadable,
    },
  }
}

/** 장부에서 온 딜인가 — mergeLedgerIntoDeals 가 만든 장부 딜(raw.ledgerDeal, id 'ledger-…'·'draft-…'). */
export function isLedgerRevenueDeal(deal: { id: string; raw?: Record<string, unknown> | null }): boolean {
  const marker = deal.raw?.ledgerDeal
  if (marker && typeof marker === "object") return true
  return /^(ledger|draft)-/.test(deal.id)
}

/**
 * 매출 범위 — 팀과 담당을 함께 건다(F-41: 담당을 고르면 팀 ∩ 담당, 표와 같다). 담당은 branchManagerMatches(별칭·대소문자,
 * F-42). team 이 없거나 "ALL"이면 전 팀, manager 가 없으면 전 담당.
 */
export function scopeLedgerRevenueDeals<T extends Pick<BranchRevDeal, "team" | "manager">>(
  deals: ReadonlyArray<T>,
  scope: { team?: string | null; manager?: string | null },
): T[] {
  const team = scope.team && scope.team !== "ALL" ? scope.team : null
  const manager = scope.manager || null
  if (!team && !manager) return [...deals]
  return deals.filter((deal) => (!team || deal.team === team) && (!manager || branchManagerMatches(deal.manager, manager)))
}
