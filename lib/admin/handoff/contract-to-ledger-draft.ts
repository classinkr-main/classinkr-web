import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getContractDocument } from "@/lib/portal/repositories/contract-documents"
import { getDeal } from "@/lib/portal/repositories/deals"
import {
  createBranchSalesLedgerDraft,
  type BranchSalesLedgerDraft,
} from "@/lib/repositories/branch-sales-ledger-drafts"

/**
 * V2 계약 양측 서명 완료(admin_signed) 직후, 매출 원장 입력 큐에
 * forecast 초안(draft)을 1건 자동 제안한다.
 *
 * 설계 원칙:
 * - draft까지만 넣는다. 검수(checked) → 적용(apply RPC)은 사람이 한다.
 * - 통화 환산 금지: 계약 금액(KRW 추정, 스키마에 통화 컬럼 없음)은 note/metadata에
 *   참고용으로만 남기고, 원장 amount는 0(CNY)으로 두어 검수자가 직접 입력한다.
 * - dedup: 같은 딜에서 이미 열려 있는(draft|checked) forecast-add 초안이 있으면 스킵.
 * - 실패는 throw하지 않고 결과 객체로 반환한다(서명 응답을 막지 않기 위함).
 */

/** 매출 원장 자동 제안 actor 문자열. 기존 actor 관례는 사람 이름/userId/role 문자열이므로 system: 접두사로 구분한다. */
export const CONTRACT_HANDOFF_ACTOR = "system:contract-handoff"

const FORECAST_OPERATION = "forecast-add"

export interface ProposeLedgerDraftInput {
  contractDocumentId: string
}

export type ProposeLedgerDraftResult =
  | { status: "created"; draft: BranchSalesLedgerDraft }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string }

/** 서명 시점(호출 시각) KST(UTC+9) 기준 YYYY-MM. */
function currentLedgerMonthKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const year = kst.getUTCFullYear()
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * 같은 source_deal_id에 이 핸드오프가 만든 forecast-add 초안이 **상태 무관** 하나라도 있으면 true.
 * status를 draft/checked로 좁히지 않는 이유: sign 라우트가 admin 서명마다(선서명·재서명 포함)
 * 재발화하는데, 초안이 이미 applied/cancelled 처리된 뒤 재서명하면 status 필터가 dedup을 무력화해
 * 딜당 초안이 누적된다(양산). 자동 제안은 딜당 최대 1회로 고정하고, 계약 변경(증분 납품 등)에 따른
 * 추가 초안은 검수자가 수동 생성한다. repo 파일을 수정하지 않고 admin client로 직접 조회한다.
 */
async function hasForecastDraftForDeal(dealId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("branch_sales_ledger_drafts")
    .select("id")
    .eq("source_deal_id", dealId)
    .eq("metadata->>operation", FORECAST_OPERATION)
    .limit(1)

  if (error) {
    // 테이블 부재 등은 상위에서 스킵 처리할 수 있게 던진다.
    throw new Error(`[contract-handoff] dedup 조회 실패: ${error.message}`)
  }

  return (data ?? []).length > 0
}

export async function proposeLedgerDraftForSignedContract(
  input: ProposeLedgerDraftInput,
): Promise<ProposeLedgerDraftResult> {
  try {
    const doc = await getContractDocument(input.contractDocumentId)
    if (!doc) {
      return { status: "skipped", reason: "contract-document-not-found" }
    }

    const deal = await getDeal(doc.deal_id)
    if (!deal) {
      return { status: "skipped", reason: "deal-not-found" }
    }

    // dedup: 같은 딜에 이 핸드오프의 forecast 초안이 (상태 무관) 이미 있으면 재제안하지 않는다 —
    // 딜당 최대 1회. admin 재서명·선서명으로 트리거가 재발화해도 초안이 양산되지 않게 한다.
    try {
      if (await hasForecastDraftForDeal(deal.id)) {
        return { status: "skipped", reason: "forecast-draft-already-exists-for-deal" }
      }
    } catch (dedupError) {
      // 원장 테이블 미적용 등: 조용히 스킵(자동 제안은 부가 기능이므로 서명 흐름을 막지 않는다).
      return {
        status: "skipped",
        reason:
          dedupError instanceof Error ? `dedup-unavailable: ${dedupError.message}` : "dedup-unavailable",
      }
    }

    // 고객명: deal → customers 조인. deal.customer_id로 조회.
    const supabase = createSupabaseAdminClient()
    const { data: customerRow } = await supabase
      .from("customers")
      .select("name")
      .eq("id", deal.customer_id)
      .maybeSingle()
    const customerName =
      (customerRow as { name: string | null } | null)?.name?.trim() || deal.title || "고객명 미입력"

    // 최신 계약 버전 total_amount(KRW 추정 — 스키마에 통화 컬럼 없음).
    let sourceAmount: number | null = null
    if (doc.current_version_id) {
      const { data: versionRow } = await supabase
        .from("contract_document_versions")
        .select("total_amount")
        .eq("id", doc.current_version_id)
        .maybeSingle()
      const raw = (versionRow as { total_amount: number | null } | null)?.total_amount
      sourceAmount = typeof raw === "number" && Number.isFinite(raw) ? raw : null
    }

    const sourceAmountLabel =
      sourceAmount != null ? `₩${Math.round(sourceAmount).toLocaleString("ko-KR")}` : "미상"

    // amount:0은 의도적 플레이스홀더다(아래 참고) — 웨이브7(20260718)에서 추가된
    // branch_sales_ledger_drafts_amount_positive_check CHECK는 status가 draft인 동안은 0원을
    // 허용하고, checked/applied로 전이할 때만 amount>0을 강제하므로 이 INSERT는 계속 안전하다.
    // createBranchSalesLedgerDraft는 웨이브7(I1)부터 { draft, dedupedRecent }를 반환한다 —
    // 이 핸드오프는 딜 단위 dedup(hasForecastDraftForDeal)을 이미 별도로 하므로 dedupedRecent는
    // 무시한다(어느 쪽이든 안전하게 기존/신규 draft 하나를 돌려받는다).
    const { draft } = await createBranchSalesLedgerDraft(
      {
        kind: "new-row",
        sourceDealId: deal.id,
        customer: customerName,
        month: currentLedgerMonthKst(),
        // 통화 환산 금지: 원장은 CNY, 계약 금액은 KRW 추정이므로 자동 amount는 0으로 두고 검수자가 입력한다.
        amount: 0,
        currency: "CNY",
        note: `계약 서명 완료 자동 제안 — 계약 금액 ${sourceAmountLabel}은 참고용, CNY 금액은 검수자가 입력`,
        metadata: {
          operation: FORECAST_OPERATION,
          confidence: "expected",
          handoff: "contract-signed",
          sourceContractDocumentId: doc.id,
          sourceDealId: deal.id,
          sourceAmount,
          // 스키마에 통화 컬럼이 없어 KRW로 단정할 수 없음을 명시적으로 남긴다.
          sourceAmountCurrency: "KRW(암묵, 스키마 통화 컬럼 없음)",
        },
      },
      CONTRACT_HANDOFF_ACTOR,
    )

    return { status: "created", draft }
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
