// 매출 장부 초안(branch_sales_ledger_drafts) 단건 POST/PATCH 본문 파서.
//
// 라운드4 P0-1(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4) — 배치 라우트
// (app/api/admin/branch/ledger-drafts/batch)와 단건 라우트가 같은 검증 순서·문구를 공유하도록
// app/api/admin/branch/ledger-drafts/route.ts(POST)와 [id]/route.ts(parseUpdate)의 본문
// 파싱 로직을 순수 함수로 뽑아냈다.
//
// 서버/클라이언트 겸용 순수 모듈 규약(lib/branch/account-key.ts와 동일) — "server-only"를
// 절대 import하지 않는다. repository(lib/repositories/branch-sales-ledger-drafts.ts)는
// "server-only"를 문(door)에 걸어 두므로, 거기서 kind/status 허용값 같은 런타임 값을 그대로
// 끌어오면 이 파일도 transitively server-only가 돼 순수성이 깨진다 — 그래서 두 라우트가 이미
// MONTH_RE를 각자 파일에 다시 선언해 온 것과 같은 방식으로, kind/status 허용값도 이 파일에
// 로컬로 다시 선언한다. 타입은 import type으로만 가져온다(컴파일 시 완전히 지워지므로 런타임
// import를 만들지 않는다).
import type {
  BranchSalesLedgerDraftCreateInput,
  BranchSalesLedgerDraftKind,
  BranchSalesLedgerDraftStatus,
  BranchSalesLedgerDraftUpdateInput,
} from "@/lib/repositories/branch-sales-ledger-drafts"

// 라운드4 D2 — 생성/갱신 배치와 상태 전이 배치 공통 상한. 배치 라우트 모듈(app/api/.../batch/route.ts)은
// Next App Router 규약상 HTTP 핸들러(GET/POST/PATCH 등)와 runtime 같은 정해진 필드만 export할 수
// 있어 라우트 파일에 상수를 두지 못한다 — 그래서 이 파서 파일에서 export한다.
export const LEDGER_DRAFT_BATCH_LIMIT = 200

const DRAFT_KINDS = new Set<string>(["new-row", "edit-row"])
const DRAFT_STATUSES = new Set<string>(["draft", "checked", "applied", "cancelled"])
const MONTH_RE = /^\d{4}-\d{2}$/

export type LedgerDraftBodyError = { error: string; status: 400 }

export function isLedgerDraftBodyError(value: unknown): value is LedgerDraftBodyError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === 400 &&
    typeof (value as { error?: unknown }).error === "string"
  )
}

/**
 * 단건 POST(app/api/admin/branch/ledger-drafts/route.ts)의 기존 검증 순서·문구를 그대로 옮긴
 * 파서 — kind → customer → month → amount → amount<=0 → metadata → sourceSheetRow →
 * sourceSnapshot → (신규) status. 응답 문구·상태코드는 기존과 바이트 단위로 동일해야 한다
 * (tests/api/branch-ledger-drafts-route.test.ts 회귀 보호).
 */
export function parseLedgerDraftCreateBody(
  raw: Record<string, unknown>,
): BranchSalesLedgerDraftCreateInput | LedgerDraftBodyError {
  function optionalString(value: unknown) {
    if (value == null) return undefined
    return typeof value === "string" ? value : null
  }
  function optionalRecord(value: unknown) {
    if (value == null) return undefined
    return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  }
  function optionalInteger(value: unknown) {
    if (value == null || value === "") return undefined
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.floor(numeric) : null
  }
  function requiredAmount(value: unknown) {
    if (value == null || value === "") return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }

  const kind =
    typeof raw.kind === "string" && DRAFT_KINDS.has(raw.kind) ? (raw.kind as BranchSalesLedgerDraftKind) : null
  const customer = typeof raw.customer === "string" ? raw.customer.trim() : ""
  const month = typeof raw.month === "string" && MONTH_RE.test(raw.month) ? raw.month : null
  const amount = requiredAmount(raw.amount)
  const metadata = optionalRecord(raw.metadata)
  const sourceSheetRow = optionalInteger(raw.sourceSheetRow)
  const sourceSnapshot = optionalRecord(raw.sourceSnapshot)

  if (!kind) return { error: "Invalid draft kind", status: 400 }
  if (!customer) return { error: "고객/계정명은 필수입니다.", status: 400 }
  if (!month) return { error: "월은 YYYY-MM 형식이어야 합니다.", status: 400 }
  if (amount == null) return { error: "금액은 숫자여야 합니다.", status: 400 }
  // 웨이브7(I5): 감액은 amount를 음수/0으로 넣는 게 아니라 장부 가감(반전 후 재적용)으로
  // 표현한다 — admin API를 통한 인간 입력은 항상 양수만 받는다.
  if (amount <= 0) {
    return { error: "감액은 장부 가감으로 처리하세요. 금액은 0보다 커야 합니다.", status: 400 }
  }
  if (metadata === null) return { error: "metadata must be an object", status: 400 }
  if (sourceSheetRow === null) return { error: "sourceSheetRow must be a number", status: 400 }
  if (sourceSnapshot === null) return { error: "sourceSnapshot must be an object", status: 400 }

  // 라운드4 P0-2 — 매트릭스 자가 체크: status를 생략하면 기존과 동일하게 draft로 저장된다
  // (repository buildInsert가 input.status ?? "draft"로 기본값을 채운다). 여기서는 draft|checked
  // 두 값만 인간 입력 경로로 허용한다(applied/cancelled는 생성 시점에 의미가 없다).
  let status: "draft" | "checked" | undefined
  if (raw.status !== undefined) {
    if (raw.status !== "draft" && raw.status !== "checked") {
      return { error: "Invalid draft status", status: 400 }
    }
    status = raw.status
  }

  return {
    kind,
    sourceDealId: optionalString(raw.sourceDealId),
    sourceSheetRow,
    sourceSnapshot,
    customer,
    manager: optionalString(raw.manager),
    team: optionalString(raw.team),
    month,
    amount,
    currency: optionalString(raw.currency),
    note: optionalString(raw.note),
    metadata,
    status,
  }
}

/**
 * 단건 PATCH([id]/route.ts)의 기존 parseUpdate와 동일한 파서(검증 순서·문구 그대로).
 *
 * "applied"로의 직접 전이 거부 문구("Use action=apply to apply a checked draft")는 여기서도
 * 던진다 — 배치 라우트가 단건 [id]/route.ts를 거치지 않고 이 파서를 바로 부르기 때문에 파서
 * 자체가 최종 방어선이어야 한다. 다만 그 리터럴을 라우트 소스에서 찾는 회귀 테스트
 * (tests/api/branch-ledger-drafts-route.test.ts)가 있어, 단건 [id]/route.ts는 이 파서를
 * 부르기 전에 같은 거부를 라우트 자신의 코드로도 한 번 더 앞세운다(중복이지만 두 곳 모두
 * 안전 — 정본은 이 파서다).
 */
export function parseLedgerDraftUpdateBody(
  raw: Record<string, unknown>,
): BranchSalesLedgerDraftUpdateInput | LedgerDraftBodyError {
  function optionalString(value: unknown) {
    if (value == null) return undefined
    return typeof value === "string" ? value : null
  }
  function optionalAmount(value: unknown) {
    if (value === undefined) return undefined
    if (value == null || value === "") return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  function optionalInteger(value: unknown) {
    if (value === undefined) return undefined
    if (value == null || value === "") return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? Math.floor(numeric) : null
  }
  function optionalRecord(value: unknown) {
    if (value === undefined) return undefined
    if (value == null) return null
    return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  }

  const update: BranchSalesLedgerDraftUpdateInput = {}

  if (raw.kind !== undefined) {
    if (typeof raw.kind !== "string" || !DRAFT_KINDS.has(raw.kind)) {
      return { error: "Invalid draft kind", status: 400 }
    }
    update.kind = raw.kind as BranchSalesLedgerDraftKind
  }

  if (raw.status !== undefined) {
    if (typeof raw.status !== "string" || !DRAFT_STATUSES.has(raw.status)) {
      return { error: "Invalid draft status", status: 400 }
    }
    if (raw.status === "applied") {
      return { error: "Use action=apply to apply a checked draft", status: 400 }
    }
    update.status = raw.status as BranchSalesLedgerDraftStatus
  }

  if (raw.sourceDealId !== undefined) update.sourceDealId = optionalString(raw.sourceDealId)
  if (raw.sourceSheetRow !== undefined) {
    const sourceSheetRow = optionalInteger(raw.sourceSheetRow)
    if (sourceSheetRow === undefined) return { error: "sourceSheetRow must be a number", status: 400 }
    update.sourceSheetRow = sourceSheetRow
  }
  if (raw.sourceSnapshot !== undefined) {
    const sourceSnapshot = optionalRecord(raw.sourceSnapshot)
    if (sourceSnapshot === null) return { error: "sourceSnapshot must be an object", status: 400 }
    update.sourceSnapshot = sourceSnapshot
  }
  if (raw.customer !== undefined) {
    if (typeof raw.customer !== "string" || !raw.customer.trim()) {
      return { error: "고객/계정명은 필수입니다.", status: 400 }
    }
    update.customer = raw.customer.trim()
  }
  if (raw.manager !== undefined) update.manager = optionalString(raw.manager)
  if (raw.team !== undefined) update.team = optionalString(raw.team)
  if (raw.month !== undefined) {
    if (typeof raw.month !== "string" || !MONTH_RE.test(raw.month)) {
      return { error: "월은 YYYY-MM 형식이어야 합니다.", status: 400 }
    }
    update.month = raw.month
  }
  if (raw.amount !== undefined) {
    const amount = optionalAmount(raw.amount)
    if (amount == null) return { error: "금액은 숫자여야 합니다.", status: 400 }
    // 웨이브7(I5): POST와 동일하게 admin API를 통한 amount 수정은 항상 양수만 받는다 — 감액은
    // 장부 가감(반전 후 재적용)으로 표현한다.
    if (amount <= 0) {
      return { error: "감액은 장부 가감으로 처리하세요. 금액은 0보다 커야 합니다.", status: 400 }
    }
    update.amount = amount
  }
  if (raw.currency !== undefined) update.currency = optionalString(raw.currency)
  if (raw.note !== undefined) update.note = optionalString(raw.note)
  if (raw.metadata !== undefined) {
    const metadata = optionalRecord(raw.metadata)
    if (metadata === null) return { error: "metadata must be an object", status: 400 }
    update.metadata = metadata
  }

  return update
}
