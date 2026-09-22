// 매출 장부 입력 속도 라운드 — P1-4(매트릭스 인라인 신규 행)의 기반 파생.
//
// 지금 매트릭스는 "적용된(applied)" 초안만 행으로 보여준다. 미적용(draft|checked) new-row
// 초안은 체크 큐에만 있고, 셀에는 앰버 점으로만 표시된다(buildMatrixPendingByCell —
// ./rev-matrix-logic.ts, 그 딜과 같은 sourceDealId/고객명을 가진 "기존" 행이 있을 때만 찍힌다).
// 그래서 레일에서 새 고객 행을 만들어 저장해도, 적용 전까지는 매트릭스 어디에도 나타나지
// 않는다 — 입력 직후 행이 사라진 것처럼 보여 혼란스럽다.
//
// 이 파일은 그 미적용 new-row 초안들을 매트릭스용 "임시 행"으로 미리 보여주기 위한 순수 파생
// 함수만 담는다(렌더/워크벤치 배선은 다음 라운드 — rows 조립에 끼워 넣는 것까지는 이번 범위 밖).
//
// 필드 매핑·필터는 SalesLedgerWorkbench.tsx의 ledgerEntryRows/appliedDraftFallbackRows
// (초안 → LedgerRevenueRow 매핑의 기존 규약)를 그대로 따른다 — 새 규약을 만들지 않는다.
// 유일한 구조적 차이는 "고객 1명 = 행 1개"로 합치는 것(아래 buildPendingDraftRows) — 적용 전
// 임시 행은 "이 고객이 곧 생긴다"는 하나의 사실이라, 워크벤치처럼 달마다 행을 늘리면(월 1건=행
// 1개 규약) 매트릭스가 안 읽힌다.

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { appliedDraftConfidenceMaps, snapshotField, snapshotText } from "./workbench-shared"
import { weeklyPaymentsFromDraftMetadata } from "./rev-matrix-logic"
import type { LedgerDraft, LedgerRevenueRow } from "./shared"

export interface PendingDraftRowsOptions {
  drafts: readonly LedgerDraft[]
  /** 매트릭스가 표시하는 회계월 12개 — 이 밖의 달은 행을 만들지 않는다(워크벤치 규약과 동일). */
  matrixMonths: readonly string[]
  /** "ALL"이면 전체, 아니면 그 팀만. */
  team: string
  /** 이미 매트릭스에 있는 행들(시트행 + 적용초안행) — 중복 행을 만들지 않기 위한 대조군. */
  existingRows: readonly LedgerRevenueRow[]
}

// LedgerRevenueRow 확장 — pendingDraftIds가 draftId(단수)를 대신한다: 이 행은 같은 고객의
// 여러 초안(서로 다른 달일 수 있음)을 합친 결과라 "그 초안 하나"가 정해지지 않는다. 그래서
// draftId·draftMonth·draftNote·sourceDealId는 (LedgerRevenueRow가 전부 선택 필드라) 그냥 비워
// 둔다 — 특정 초안 하나를 가리키는 값을 억지로 채우면, 다음 라운드(잠금 판정·편집 타겟팅 등
// rev-matrix-logic.ts의 sourceDealId 기준 매칭)가 이 행을 "그 딜의 유일한 초안"으로 오독할 수
// 있다. draftKind만 예외 — 규칙 2로 이미 "new-row"로 확정되어 있어 채워도 모호하지 않다.
export interface PendingDraftRow extends LedgerRevenueRow {
  /** 이 행을 만든 초안 id들 — (월 → 초안 id) 오름차순 정렬. */
  pendingDraftIds: string[]
  /** true면 pendingDraftIds 중 로컬 전용("local-" 접두어) 초안이 섞여 있다 — 서버에 없는
      부분을 포함하므로 호출부가 "장부 적용 불가"를 표시해야 한다. */
  pendingLocalOnly: boolean
}

// 규칙 1~3(상태·종류·표시 스코프) — 이 세 조건을 모두 통과해야 "미적용 new-row 초안"으로 본다.
function isEligibleDraft(draft: LedgerDraft, monthSet: Set<string>, team: string): boolean {
  // 규칙 1: 미적용(draft|checked)만. applied는 이미 entries/fallback 경로가 행을 만들고,
  // cancelled는 폐기된 초안이라 둘 다 여기서 다시 임시 행을 만들 대상이 아니다.
  if (draft.status !== "draft" && draft.status !== "checked") return false
  // 규칙 2: new-row만. edit-row는 기존 행의 셀에 pending 점으로 이미 표시되므로 행을 새로 만들지 않는다.
  if (draft.kind !== "new-row") return false
  // 규칙 3: 표시 월(matrixMonths)·팀 스코프 — 워크벤치 ledgerEntryRows/appliedDraftFallbackRows와 동일 필터.
  if (!monthSet.has(draft.month)) return false
  if (team !== "ALL" && draft.team !== team) return false
  return true
}

// 그룹(같은 정규화 고객키) 내부 정렬 — (월 → 초안 id) 오름차순으로 고정한다. 대표 필드(고객명
// 표기·담당자·팀·지역 등 — buildRowForGroup의 primary)와 pendingDraftIds 순서가 입력 배열의
// 원래 순서에 흔들리지 않게 하기 위함이다 — 규칙 6(id 안정성)은 id 문자열뿐 아니라 행 전체가
// 같은 입력에 대해 항상 같은 결과여야 한다는 뜻이라, 대표 선택도 결정적이어야 한다.
function sortGroupDrafts(drafts: LedgerDraft[]): LedgerDraft[] {
  return [...drafts].sort((a, b) => {
    if (a.month !== b.month) return a.month < b.month ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// 한 고객 그룹(정규화 키 하나)의 초안들을 임시 행 하나로 합친다.
function buildRowForGroup(key: string, groupDrafts: LedgerDraft[]): PendingDraftRow {
  const sorted = sortGroupDrafts(groupDrafts)
  const primary = sorted[0]

  const monthlyPayments: Record<string, number> = {}
  const monthlyConfirmed: Record<string, number> = {}
  const monthlyHighConfidence: Record<string, number> = {}
  const weeklyPayments: Record<string, number[]> = {}

  for (const draft of sorted) {
    // 규칙 5(합산) — 같은 고객·같은 달 초안 2건은 금액을 더한다(forecast-add 누적 규약과 동일:
    // 한 달에 예상 매출이 여러 건 쌓이면 그 달 합계로 본다).
    monthlyPayments[draft.month] = (monthlyPayments[draft.month] ?? 0) + draft.amount

    // appliedDraftConfidenceMaps 재사용(워크벤치가 쓰는 것과 동일 함수·동일 산식). monthlyRed는
    // 불리언("그 달 전액 확정")이라 초안별로 합칠 수 없으므로, confirmed/highConfidence 금액만
    // 여기서 누적하고 red는 모든 초안을 다 더한 뒤(아래) 합산 금액 기준으로 다시 판정한다.
    const confMaps = appliedDraftConfidenceMaps(draft.month, draft.amount, draft.metadata)
    const confirmed = confMaps.monthlyConfirmed?.[draft.month] ?? 0
    if (confirmed > 0) monthlyConfirmed[draft.month] = (monthlyConfirmed[draft.month] ?? 0) + confirmed
    const highConfidence = confMaps.monthlyHighConfidence?.[draft.month] ?? 0
    if (highConfidence > 0) {
      monthlyHighConfidence[draft.month] = (monthlyHighConfidence[draft.month] ?? 0) + highConfidence
    }

    // weeklyPaymentsFromDraftMetadata 재사용 — 같은 달 2건이 각각 주차 정보를 가지면 주차별로
    // 더한다. 한쪽만 주차 정보가 있으면 그 정보만 반영돼 주차 합<월 합이 될 수 있는데, 이는
    // "이 달 금액의 일부만 주차로 쪼개져 있다"는 사실을 있는 그대로 보여주는 것이다(허위로 채우지 않는다).
    const weekly = weeklyPaymentsFromDraftMetadata(draft.month, draft.amount, draft.metadata)
    const weeklyForMonth = weekly[draft.month]
    if (weeklyForMonth) {
      const merged = weeklyPayments[draft.month] ? [...weeklyPayments[draft.month]] : [0, 0, 0, 0, 0]
      weeklyForMonth.forEach((value, index) => {
        merged[index] = (merged[index] ?? 0) + value
      })
      weeklyPayments[draft.month] = merged
    }
  }

  // monthlyRed 재판정 — 초안별 red를 그대로 OR로 합치면 "각자는 부분확정인데 합계는 전액확정"인
  // 경우를 놓치고, "각자는 전액확정인데 합계는 부분"인 경우(예: 같은 달에 이미 전액확정인 초안
  // 옆에 별도 금액의 미확정 초안이 하나 더 붙는 경우)를 잘못 true로 남긴다. appliedDraftConfidenceMaps와
  // 동일한 ¥1 오차 허용 규칙을, 초안별이 아니라 합산치(월 합계 대 합산 confirmed)에 다시 적용해야 정확하다.
  const monthlyRed: Record<string, boolean> = {}
  for (const month of Object.keys(monthlyPayments)) {
    const total = monthlyPayments[month]
    const confirmed = monthlyConfirmed[month] ?? 0
    if (total > 0 && confirmed >= total - 1) monthlyRed[month] = true
  }

  const revenue = Object.values(monthlyPayments).reduce((sum, value) => sum + value, 0)
  const pendingDraftIds = sorted.map((draft) => draft.id)
  // 규칙 7 — 로컬 전용("local-") 초안이 하나라도 섞이면 행 전체를 "장부 적용 불가 가능성 있음"으로
  // 표시한다. 어느 초안이 로컬인지 부분 표시하려면 셀 단위 정보가 더 필요한데, 이 행은 이미 여러
  // 초안을 합친 요약이라 행 단위 배지가 호출부(다음 라운드) 입장에서 다루기 가장 단순하다.
  const pendingLocalOnly = pendingDraftIds.some((id) => id.startsWith("local-"))

  return {
    id: `pending-${key}`,
    customer: primary.customer || "고객명 미입력",
    manager: primary.manager || null,
    team: primary.team || null,
    region: snapshotText(primary.sourceSnapshot, "region"),
    status: snapshotText(primary.sourceSnapshot, "status"),
    dealType: snapshotText(primary.sourceSnapshot, "dealType"),
    productVersion: snapshotText(primary.sourceSnapshot, "productVersion"),
    firstPayment: snapshotText(primary.sourceSnapshot, "firstPayment"),
    contractTarget: Number(snapshotField(primary.sourceSnapshot, "contractTarget") ?? 0),
    revenue,
    monthlyPayments,
    monthlyConfirmed,
    monthlyHighConfidence,
    monthlyRed,
    weeklyPayments,
    ledgerOrigin: "draft",
    draftKind: "new-row",
    draftMetadata: primary.metadata,
    pendingDraftIds,
    pendingLocalOnly,
  }
}

/**
 * 미적용(draft|checked) new-row 초안을 매트릭스 임시 행으로 만든다. 규칙 1~7은 이 파일 상단
 * 주석과 isEligibleDraft·buildRowForGroup 참고. 호출부(다음 라운드)는 이 결과를 시트행·적용초안행과
 * 합쳐 매트릭스 rows에 이어붙이면 된다 — 이 함수는 그 조립을 하지 않는다(순수 파생만).
 */
export function buildPendingDraftRows(options: PendingDraftRowsOptions): PendingDraftRow[] {
  const { drafts, matrixMonths, team, existingRows } = options
  const monthSet = new Set(matrixMonths)
  // 규칙 4의 대조군은 정규화 키가 아니라 **trim한 고객명 그대로**다 — buildMatrixPendingByCell
  // (rev-matrix-logic.ts)이 new-row 초안을 기존 행 셀에 점으로 붙일 때 쓰는 술어와 같아야 하기
  // 때문이다. 정규화 키로 제외하면 "OO 학원" 초안이 "OO학원" 행에 점도 안 찍히고(그 함수는 정확 일치)
  // 임시 행도 안 생겨 매트릭스 어디에도 안 보인다. 반대로 그 함수를 정규화 키로 넓히는 수리는 틀리다:
  // 셀 재편집이 그 new-row 초안을 edit-row로 PATCH하는 경로(onCommitCell → lookupMatrixPending)까지
  // 퍼지 매칭으로 넓어져, "추가분"으로 만든 초안이 다른 표기 행의 "대체 정정"으로 바뀔 수 있다.
  // 표기가 다른 초안의 임시 행은 매트릭스 고객 그룹핑(정규화 키)에 의해 같은 그룹 안에 붙는다.
  const existingNames = new Set(existingRows.map((row) => row.customer.trim()))

  // 규칙 5 — 같은 정규화 고객키의 초안을 한 그룹으로 모은다. Map은 첫 발견 순서를 보존하지만
  // 그 순서는 최종 결과에 영향을 주지 않는다(그룹 내부는 sortGroupDrafts로, 행 순서는 마지막에
  // 고객명 정렬로 각각 고정한다).
  const groups = new Map<string, LedgerDraft[]>()
  for (const draft of drafts) {
    if (!isEligibleDraft(draft, monthSet, team)) continue
    const key = normalizedAccountKey(draft.customer)
    // 빈 이름 가드: 정규화 키가 없으면(고객명 미입력) 서로 무관한 초안들이 한 행으로 잘못 합쳐질
    // 수 있어 제외한다. 규칙 4: 같은 이름(trim 일치)의 행이 이미 있으면 그 행의 셀에 pending 점으로
    // 이미 표시되므로(buildMatrixPendingByCell) 임시 행을 또 만들지 않는다(이중 표시 방지).
    if (!key || existingNames.has(draft.customer.trim())) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(draft)
    else groups.set(key, [draft])
  }

  const rows = Array.from(groups.entries()).map(([key, groupDrafts]) => buildRowForGroup(key, groupDrafts))
  // 정렬: 고객명 localeCompare(ko).
  return rows.sort((a, b) => a.customer.localeCompare(b.customer, "ko"))
}
